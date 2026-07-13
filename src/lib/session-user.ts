import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getUserFromRequest, type SessionUser } from '@/lib/auth';
import { ACTIVE_USER_FILTER, ALL_CONSTITUENCIES } from '@/lib/user-management';

export async function resolveSessionUser(request: Request): Promise<SessionUser | null> {
  const cookieUser = getUserFromRequest(request);
  if (!cookieUser?.email) {
    return null;
  }

  await connectDB();
  const dbUser = await User.findOne({
    email: cookieUser.email,
    ...ACTIVE_USER_FILTER,
  }).lean();

  if (!dbUser) {
    return null;
  }

  return {
    ...cookieUser,
    constituencyAccess: String(dbUser.constituencyAccess ?? ALL_CONSTITUENCIES),
  };
}
