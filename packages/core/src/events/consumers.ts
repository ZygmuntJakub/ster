import type { SessionEventConsumer } from "../extensions/index.js";
import type { Logger } from "../log.js";
import type { CoreEvent, EventStream } from "./stream.js";

/**
 * Wire `SessionEventConsumer` extensions to the event stream (FR-060).
 * Consumer failures are logged and never block session delivery.
 */
export function attachEventConsumers(
  stream: EventStream<CoreEvent>,
  consumers: ReadonlyArray<SessionEventConsumer>,
  log: Logger,
): () => void {
  if (consumers.length === 0) {
    return () => {
      /* no-op */
    };
  }

  return stream.subscribe((event) => {
    for (const consumer of consumers) {
      try {
        const result = consumer.onEvent(event);
        if (result !== undefined && typeof result.then === "function") {
          void result.catch((error: unknown) => {
            log.error("session event consumer failed", {
              consumerId: consumer.id,
              eventType: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error) {
        log.error("session event consumer failed", {
          consumerId: consumer.id,
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}
