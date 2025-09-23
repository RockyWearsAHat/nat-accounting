import mongoose from "mongoose";

export interface IConsultation {
  data: Record<string, any>;
  internalEstimate?: Record<string, any>;
  createdAt: Date;
}

const ConsultationSchema = new mongoose.Schema<IConsultation>(
  {
    data: { type: Object, required: true },
    internalEstimate: { type: Object },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Export model, ensuring singleton
export const ConsultationModel =
  mongoose.models.Consultation || mongoose.model<IConsultation>("Consultation", ConsultationSchema);
