import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getUserFromRequest, type SessionUser } from '@/lib/auth';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';

export async function resolveSessionUser(request: Request): Promise<SessionUser | null> {
  const cookieUser = getUserFromRequest(request);
  if (!cookieUser?.email) {
    return null;
  }

  if (cookieUser.constituencyAccess) {
    return cookieUser;
  }

  await connectDB();
  const dbUser = await User.findOne({ email: cookieUser.email }).lean();
  if (!dbUser) {
    return cookieUser;
  }

  return {
    ...cookieUser,
    constituencyAccess: String(dbUser.constituencyAccess ?? ALL_CONSTITUENCIES),
  };
}
