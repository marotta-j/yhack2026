import mongoose, { Schema, model, models } from "mongoose";

export interface IUser {
  name: string;
  email: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const User = models.User ?? model<IUser>("User", UserSchema);

export default User;
