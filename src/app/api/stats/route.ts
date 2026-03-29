import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Message from "@/models/Message";
import SubtaskDocumentModel from "@/models/SubtaskDocument";
import UserStats from "@/models/UserStats";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const userId = new Types.ObjectId(session.user.id);

  const [lifetimeStats, subtasks, dailyRaw] = await Promise.all([
    // Lifetime totals from UserStats — these persist even after conversations are deleted
    UserStats.findOne({ userId }),

    // Subtask counts by model and by type — SubtaskDocuments are never deleted
    SubtaskDocumentModel.aggregate([
      { $match: { userId } },
      {
        $facet: {
          byModel: [
            { $group: { _id: "$model_id", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          byType: [
            { $group: { _id: "$type", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
        },
      },
    ]),

    // Carbon saved per day (last 30 days) — from remaining messages
    Message.aggregate([
      {
        $match: {
          userId,
          role: "assistant",
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          saved: { $sum: "$carbonDelta" },
          used: { $sum: "$carbonCost" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const totals = {
    totalMessages:      lifetimeStats?.totalMessages      ?? 0,
    totalTokens:        lifetimeStats?.totalTokens        ?? 0,
    totalCarbonCost:    lifetimeStats?.totalCarbonCost    ?? 0,
    totalCarbonSaved:   lifetimeStats?.totalCarbonSaved   ?? 0,
    totalNaiveBaseline: lifetimeStats?.totalNaiveBaseline ?? 0,
  };

  return NextResponse.json({
    totalMessages: totals.totalMessages,
    totalTokens: totals.totalTokens,
    totalCarbonCost: totals.totalCarbonCost,
    totalCarbonSaved: totals.totalCarbonSaved,
    totalNaiveBaseline: totals.totalNaiveBaseline,
    savingsPct: totals.totalNaiveBaseline > 0
      ? Math.round((totals.totalCarbonSaved / totals.totalNaiveBaseline) * 100)
      : 0,
    byModel: subtasks[0]?.byModel ?? [],
    byType: subtasks[0]?.byType ?? [],
    daily: dailyRaw.map((d: { _id: string; saved: number; used: number }) => ({
      date: d._id,
      saved: d.saved,
      used: d.used,
    })),
  });
}
