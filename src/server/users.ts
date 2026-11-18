import { db } from "@/db";
import { users } from "@/db/schema";
import type { EveryAppUser } from "@every-app/sdk/server";

/** The app's record of a member, created on first sight from the Gateway's identity. */
export async function ensureUser(user: EveryAppUser): Promise<void> {
  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email,
      orgId: user.orgId,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, orgId: user.orgId },
    });
}
