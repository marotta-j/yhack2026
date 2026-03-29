import { Schema, model, models, Types } from "mongoose";

export interface IUserStats {
  userId: Types.ObjectId;
  totalMessages: number;
  totalTokens: number;
  totalCarbonCost: number;
  totalCarbonSaved: number;
  totalNaiveBaseline: number;
}

const UserStatsSchema = new Schema<IUserStats>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
  totalMessages: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  totalCarbonCost: { type: Number, default: 0 },
  totalCarbonSaved: { type: Number, default: 0 },
  totalNaiveBaseline: { type: Number, default: 0 },
});

const UserStats = models.UserStats ?? model<IUserStats>("UserStats", UserStatsSchema);
export default UserStats;
