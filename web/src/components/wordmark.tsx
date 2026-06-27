const ART = [
  '  ____ _           _     __                  _    ',
  ' / ___| |__   __ _| |_  | //  _   _  ___ ___| | __',
  "| |   | '_ \\ / _` | __| |//| | | | |/ __/ _ \\ |/ /",
  '| |___| | | | (_| | |_  // |_| |_| | (_|  __/   < ',
  ' \\____|_| |_|\\__,_|\\__| |_____\\__,_|\\___\\___|_|\\_\\',
].join('\n');

export function Wordmark() {
  return (
    <pre
      aria-label="Chat Łucek"
      style={{ fontFamily: '"Courier New", monospace' }}
      className="text-fg-strong overflow-x-auto text-center text-[clamp(7px,2.5vw,17px)] leading-[1.2]"
    >
      {ART}
    </pre>
  );
}
