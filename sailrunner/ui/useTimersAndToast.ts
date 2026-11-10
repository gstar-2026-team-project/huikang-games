import { useCallback, useMemo, useRef, useState } from "react";

const TOAST_MS = 2200;

/** One-shot timers cleared on unmount, and a single transient toast. */
export function useTimersAndToast() {
	const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
	const timers = useRef<number[]>([]);
	const later = useCallback((fn: () => void, ms: number) => {
		timers.current.push(window.setTimeout(fn, ms));
	}, []);
	const clearTimers = useCallback(() => {
		for (const id of timers.current) window.clearTimeout(id);
		timers.current = [];
	}, []);
	const showToast = useCallback(
		(text: string) => {
			const id = Date.now();
			setToast({ text, id });
			later(() => setToast((t) => (t?.id === id ? null : t)), TOAST_MS);
		},
		[later],
	);
	return useMemo(() => ({ toast, showToast, later, clearTimers }), [toast, showToast, later, clearTimers]);
}
