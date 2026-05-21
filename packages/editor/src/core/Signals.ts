export type SignalListener<T> = (payload: T) => void;

/**
 * A minimal typed event channel — the editor's mrdoob-style signal bus. Used
 * to decouple the framework-agnostic {@link EditorState} from the React layer.
 */
export class Signal<T = void> {
  private readonly listeners = new Set<SignalListener<T>>();

  /** Subscribe to the signal; returns an unsubscribe function. */
  add(listener: SignalListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Notify every current subscriber. */
  dispatch(payload: T): void {
    for (const listener of [...this.listeners]) listener(payload);
  }

  /** Drop all subscribers. */
  clear(): void {
    this.listeners.clear();
  }
}
