import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export default function App() {
  const health = useQuery(api.health.ping);
  return (
    <main style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1>Sourcer</h1>
      <p>Supplier sourcing and reorder agent for restaurants.</p>
      <p>Backend: {health ? `live (${new Date(health.at).toISOString()})` : "connecting…"}</p>
    </main>
  );
}
