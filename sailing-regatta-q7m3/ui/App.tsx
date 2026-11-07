import { useLiveQuery } from "poe-tiles-sdk/v1/react";
import { useEffect, useMemo, useState } from "react";
import { dayKey } from "../game/course";
import type { AppProps } from "./app-contract";
import { createDayReader } from "./data";
import { Regatta } from "./Regatta";

/** How often to check whether the UTC day (and so the course) has rolled over. */
const DAY_CHECK_MS = 60_000;

export function App(props: AppProps) {
	const [ready, setReady] = useState(false);
	const [day, setDay] = useState(() => dayKey(Date.now()));

	useEffect(() => {
		let live = true;
		props.store.waitForBootstrap().then(
			() => live && setReady(true),
			(error: unknown) => {
				console.error(error);
				if (live) setReady(true);
			},
		);
		return () => {
			live = false;
		};
	}, [props.store]);

	useEffect(() => {
		const id = window.setInterval(() => setDay(dayKey(Date.now())), DAY_CHECK_MS);
		return () => window.clearInterval(id);
	}, []);

	const reader = useMemo(() => createDayReader(day), [day]);
	const { data } = useLiveQuery(ready ? props.store : null, reader);

	if (!ready || !data) {
		return (
			<div className="loading" data-testid="loading">
				<span className="loading-boat">⛵</span>
				<span>Rigging the boat…</span>
			</div>
		);
	}
	return <Regatta {...props} data={data} />;
}
