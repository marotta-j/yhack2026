import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Message from "@/models/Message";
import SubtaskDocumentModel from "@/models/SubtaskDocument";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const userId = new Types.ObjectId(session.user.id);

  const [carbonAgg, subtasks, dailyRaw] = await Promise.all([
    // Total carbon used + saved across all assistant messages
    Message.aggregate([
      { $match: { userId, role: "assistant" } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          totalCarbonCost: { $sum: "$carbonCost" },
          totalCarbonSaved: { $sum: "$carbonDelta" },
          totalNaiveBaseline: { $sum: "$naiveBaseline" },
          totalTokens: { $sum: "$totalTokens" },
        },
      },
    ]),

    // Subtask counts by model and by type
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

    // Carbon saved per day (last 30 days)
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

  const totals = carbonAgg[0] ?? {
    totalMessages: 0,
    totalCarbonCost: 0,
    totalCarbonSaved: 0,
    totalNaiveBaseline: 0,
    totalTokens: 0,
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
