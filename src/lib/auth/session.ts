import { getServerSession } from "next-auth";
import type { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { assertPermission, PermissionDeniedError } from "@/lib/rbac";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.role) {
    return null;
  }
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requirePermission(
  allowed: boolean,
  message = "Permission denied",
): Promise<SessionUser> {
  const user = await requireSessionUser();
  try {
    assertPermission(allowed, message);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw error;
    }
    throw error;
  }
  return user;
}
