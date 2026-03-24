interface NumPadProps {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  onConfirm?: () => void;
  /** When true, renders taller keys suitable for cash-entry numpad */
  large?: boolean;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '⌫'];

export default function NumPad({
  value,
  onChange,
  maxLength = 10,
  onConfirm,
  large = false,
}: NumPadProps) {
  function handleKey(key: string) {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === ',' && value.includes(',')) return;
    // Block leading double-zero
    if (key === '0' && value === '0') return;
    if (value.length >= maxLength) return;
    onChange(value + key);
  }

  const keyHeight = large ? 'min-h-[56px]' : 'min-h-[52px]';
  const fontSize = large ? 'text-xl' : 'text-lg';

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {KEYS.map((k, i) => (
        <button
          key={i}
          type="button"
          onClick={() => handleKey(k)}
          className={`${keyHeight} ${fontSize} rounded-xl font-mono font-medium transition-all duration-100
            bg-[#0e1115] border border-white/[0.06] text-white
            hover:bg-white/10 active:scale-95 active:bg-white/5
            flex items-center justify-center select-none
            ${k === '⌫' ? 'text-[#6b7280] hover:text-red-400 hover:border-red-900/40' : ''}
          `}
        >
          {k === '⌫' ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          ) : (
            k
          )}
        </button>
      ))}
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          className="col-span-3 min-h-[52px] rounded-xl bg-[#00e87a] hover:bg-[#00d470] active:scale-[0.99] text-black font-bold text-base transition-all"
        >
          OK
        </button>
      )}
    </div>
  );
}
