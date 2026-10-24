"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";
import type { AgentDetail } from "@/lib/types";

const DEFAULT_POST = "Summary, decisions, action items by owner.";

export function InstructionsTab({ agent }: { agent: AgentDetail }) {
  const update = useMutation(api.agents.update);
  const [behaviour, setBehaviour] = useState(agent.behaviourInstructions);
  const [post, setPost] = useState(agent.postMeetingInstructions);
  const [busy, setBusy] = useState(false);

  const dirty = behaviour !== agent.behaviourInstructions || post !== agent.postMeetingInstructions;

  async function save() {
    setBusy(true);
    try {
      await update({
        agentId: agent._id,
        behaviourInstructions: behaviour,
        postMeetingInstructions: post,
      });
      toast.success("Instructions saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <InstructionField
        id="behaviour"
        title="Behaviour"
        description={`Added to every prompt ${agent.name} runs, in calls and on Slack.`}
        placeholder="Keep answers under 20 seconds. Prices in USD."
        value={behaviour}
        onChange={setBehaviour}
      />
      <InstructionField
        id="post"
        title="Meeting notes"
        description="What goes into the notes posted to Slack when a call ends."
        placeholder={DEFAULT_POST}
        value={post}
        onChange={setPost}
        footer={
          post.trim() !== DEFAULT_POST && (
            <button
              type="button"
              onClick={() => setPost(DEFAULT_POST)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reset to default
            </button>
          )
        }
      />
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setBehaviour(agent.behaviourInstructions);
              setPost(agent.postMeetingInstructions);
            }}
          >
            Discard
          </Button>
        )}
      </div>
    </div>
  );
}

function InstructionField({
  id,
  title,
  description,
  placeholder,
  value,
  onChange,
  footer,
}: {
  id: string;
  title: string;
  description: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <label htmlFor={id} className="block">
        <span className="text-base font-semibold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        maxLength={4000}
        className="mt-4 resize-y bg-background text-[15px] leading-relaxed"
      />
      <div className="mt-2 flex items-center justify-between">
        <div>{footer}</div>
        <span className="text-xs text-muted-foreground tabular-nums">{value.length}/4000</span>
      </div>
    </div>
  );
}
