/**
 * Greedy routing recommendation for an interactive provision (exploit).
 *
 * Returns the best feasible arm under the active policy, or null if no arm is
 * feasible. task_class is omitted at provision time, so this uses the global
 * posteriors. The human confirms in DeployAndTalk (recommend-then-confirm).
 */

import { enumerateFeasibleArms } from "@/lib/learning/arms";
import { bestArm, type ArmScore } from "@/lib/learning/bandit";
import { readActivePolicy } from "@/lib/learning/policy";
import { DEFAULT_WEIGHTS } from "@/lib/learning/reward";
import { emptyArtifact } from "@/lib/learning/types";
import type { UserConfig } from "@/lib/user-config/schema";

export async function recommendArm(config: UserConfig): Promise<ArmScore | null> {
	const arms = enumerateFeasibleArms(config);
	if (arms.length === 0) return null;
	const policy = await readActivePolicy().catch(() => null);
	return bestArm(
		arms,
		policy?.artifact ?? emptyArtifact(),
		policy?.weights ?? DEFAULT_WEIGHTS,
		null,
	);
}
