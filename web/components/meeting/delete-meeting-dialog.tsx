"use client";

import { useMutation } from "convex/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/format";

export function DeleteMeetingDialog({
  meetingId,
  onDeleted,
  children,
}: {
  meetingId: Id<"meetings">;
  onDeleted?: () => void;
  /** The trigger element, rendered via asChild. */
  children: ReactNode;
}) {
  const remove = useMutation(api.meetings.remove);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
          <AlertDialogDescription>
            The notes, whiteboard, answers, relay log and transcript are deleted, and the meeting is removed from the
            agent&rsquo;s memory. Messages already posted to Slack stay there.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={async () => {
              try {
                await remove({ meetingId });
                toast.success("Meeting deleted");
                onDeleted?.();
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            Delete meeting
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
