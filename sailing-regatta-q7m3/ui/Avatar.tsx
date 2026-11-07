import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import { useState } from "react";
import { playerName } from "./data";

/** Profile photo with an initials fallback, never a broken image. */
export function Avatar({ profile, size = 28 }: { profile: PoeUserInfo | undefined; size?: number }) {
	const [failed, setFailed] = useState(false);
	const name = playerName(profile);
	const initials = name
		.split(/\s+/)
		.map((part) => part[0] ?? "")
		.join("")
		.slice(0, 2)
		.toUpperCase();
	const style = { width: size, height: size, fontSize: size * 0.4 };
	if (profile?.profilePicture && !failed) {
		return (
			<img
				className="avatar"
				src={profile.profilePicture}
				alt=""
				style={style}
				onError={() => setFailed(true)}
				draggable={false}
			/>
		);
	}
	return (
		<span className="avatar avatar-initials" style={style} aria-hidden="true">
			{initials}
		</span>
	);
}
