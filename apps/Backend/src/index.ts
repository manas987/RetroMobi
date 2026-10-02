import express from "express";
import { errorHandler } from "./middleware/errorHandler.ts";
import userRoutes from "./Routes/user/index.ts";

export const app = express();

const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use("/api/user", userRoutes);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`RetroMobi backend listening on :${port}`);
});
