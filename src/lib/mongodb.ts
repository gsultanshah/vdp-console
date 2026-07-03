import mongoose from 'mongoose';
import { clearMongoUriCache, configureMongoDns, getResolvedMongoUri } from './mongo-client';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  uri: string | null;
};

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null, uri: null };

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null, uri: null };
}

async function connectDB(retryOnAuthFailure = true): Promise<typeof mongoose> {
  configureMongoDns();
  const uri = await getResolvedMongoUri();

  if (cached.conn && cached.uri === uri && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (cached.promise && cached.uri === uri) {
    try {
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (e) {
      cached.promise = null;
      cached.conn = null;
      cached.uri = null;

      const message = e instanceof Error ? e.message : String(e);
      const authFailed =
        message.includes('Authentication failed') || message.includes('AuthenticationFailed');

      if (authFailed && retryOnAuthFailure) {
        clearMongoUriCache();
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect();
        }
        return connectDB(false);
      }

      throw e;
    }
  }

  if (cached.uri && cached.uri !== uri && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 60_000,
      connectTimeoutMS: 60_000,
      socketTimeoutMS: 120_000,
      maxPoolSize: 10,
      autoSelectFamily: false,
    };

    cached.uri = uri;
    cached.promise = mongoose.connect(uri, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.uri = null;
    cached.conn = null;

    const message = e instanceof Error ? e.message : String(e);
    const authFailed =
      message.includes('Authentication failed') || message.includes('AuthenticationFailed');

    if (authFailed && retryOnAuthFailure) {
      clearMongoUriCache();
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      return connectDB(false);
    }

    throw e;
  }

  return cached.conn;
}

export default connectDB;
