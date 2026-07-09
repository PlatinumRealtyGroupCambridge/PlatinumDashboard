import { prisma } from "./prisma";

// A goal is considered "achieved" once every one of its non-archived
// sub-tasks is checked off (and it has at least one). This is always a
// derived recompute, not a one-way trigger — checking off the last
// remaining sub-task achieves the goal, and un-checking one afterward
// un-achieves it again, matching whatever state the sub-tasks are actually
// in. Called after any sub-task's done/archived state changes, or a new
// sub-task is added.
export async function recomputeGoalCompletion(goalId: string) {
  const [subtasks, goal] = await Promise.all([
    prisma.task.findMany({ where: { goalId, archived: false }, select: { done: true } }),
    prisma.goal.findUnique({ where: { id: goalId }, select: { done: true } }),
  ]);
  if (!goal) return;

  const allDone = subtasks.length > 0 && subtasks.every((t) => t.done);
  if (goal.done === allDone) return;

  await prisma.goal.update({
    where: { id: goalId },
    data: { done: allDone, archived: allDone, archivedAt: allDone ? new Date() : null },
  });
}
