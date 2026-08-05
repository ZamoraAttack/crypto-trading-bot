"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function ApprovalActions({ approvalId }: { approvalId: number }) {
  const router = useRouter();
  const [deciding, setDeciding] = useState(false);

  async function decide(decision: "approved" | "rejected") {
    setDeciding(true);
    try {
      await api.zamo.approvals.decide(approvalId, { decision, decided_by: "founder" });
      router.refresh();
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => decide("approved")}
        disabled={deciding}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-success/20 text-success border border-success/40 hover:bg-success/30 transition disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => decide("rejected")}
        disabled={deciding}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-danger/20 text-danger border border-danger/40 hover:bg-danger/30 transition disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
