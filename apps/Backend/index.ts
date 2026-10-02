import { app } from "./src/index.ts";

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`RetroMobi backend listening on :${port}`);
});
