const ART = [
  '    _       _                   __                  _',
  '   / \\   __| | __ _ _ __ ___   | //  _   _  ___ ___| | __',
  "  / _ \\ / _` |/ _` | '_ ` _ \\  |//| | | | |/ __/ _ \\ |/ /",
  ' / ___ \\ (_| | (_| | | | | | | // |_| |_| | (_|  __/   <',
  '/_/   \\_\\__,_|\\__,_|_| |_| |_| |_____\\__,_|\\___\\___|_|\\_\\',
].join('\n');

export function Wordmark() {
  return (
    <pre
      aria-label="Adam Łucek"
      style={{ fontFamily: '"Courier New", monospace' }}
      className="text-fg-strong overflow-x-auto text-center text-[17px] leading-[1.2]"
    >
      {ART}
    </pre>
  );
}
