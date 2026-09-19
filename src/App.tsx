import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { Shell } from "./components/Shell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import SignIn from "./pages/SignIn";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import NewRequest from "./pages/NewRequest";
import RfqDetail from "./pages/RfqDetail";
import Suppliers from "./pages/Suppliers";
import Prices from "./pages/Prices";
import History from "./pages/History";
import Inbox from "./pages/Inbox";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthLoading>
        <div className="empty" style={{ minHeight: "100vh", alignContent: "center" }}>
          <div className="skeleton" style={{ width: 160 }} />
          <p className="muted">Opening Sourcer…</p>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Gate />
      </Authenticated>
    </ErrorBoundary>
  );
}

function Gate() {
  const me = useQuery(api.businesses.me);
  const location = useLocation();
  if (me === undefined) {
    return (
      <div className="empty" style={{ minHeight: "100vh", alignContent: "center" }}>
        <div className="skeleton" style={{ width: 160 }} />
      </div>
    );
  }
  if (!me || !me.onboardingComplete) {
    if (location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
    return <Onboarding business={me} />;
  }
  return (
    <Shell business={me}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/onboarding" element={<Navigate to="/" replace />} />
        <Route path="/rfqs/new" element={<NewRequest />} />
        <Route path="/rfqs/:id" element={<RfqDetail />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/prices" element={<Prices />} />
        <Route path="/history" element={<History />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
