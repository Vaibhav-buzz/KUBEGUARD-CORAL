export function createLogger(component) {
  return {
    info(event, fields = {}) {
      console.log(JSON.stringify({ level: "info", component, event, ...fields }));
    },
    warn(event, fields = {}) {
      console.warn(JSON.stringify({ level: "warn", component, event, ...fields }));
    },
    error(event, fields = {}) {
      console.error(JSON.stringify({ level: "error", component, event, ...fields }));
    }
  };
}

