import { Component, type ReactNode } from 'react'

/** Shows a message instead of a blank page if rendering throws. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed
      ? <p role="alert" className="p-6">The planner hit an error. Reload the page and check the values you entered.</p>
      : this.props.children
  }
}
