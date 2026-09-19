import { Component, type ReactNode } from "react";

type State = { error: Error | null };

/** Keeps a rendering bug from showing a stack trace to the owner. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty" style={{ minHeight: "60vh", alignContent: "center" }}>
          <h3>Something went wrong on this screen</h3>
          <p>Reload the page to continue. Your data is safe on the server.</p>
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
