import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";

export async function GET() {
  await connectToDatabase();
  const conversations = await Conversation.find({}).sort({ updatedAt: -1 }).limit(50);
  return NextResponse.json(conversations);
}

export async function POST() {
  await connectToDatabase();
  const conversation = await Conversation.create({});
  return NextResponse.json(conversation, { status: 201 });
}
