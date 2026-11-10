import {
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	expect,
	type Frame,
	type Locator,
	type Page,
} from "@playwright/test";
import {
	type TestServer,
	waitForBlobFrame,
} from "poe-tiles-sdk/v1/test-utils/playwright.js";

export interface TileTestUser {
	userId: string;
	clientId: string;
	username: string;
	displayName: string;
	profilePicture: string;
}

export interface TwoUserTile {
	alice: { context: BrowserContext; page: Page; frame: Frame };
	bob: { context: BrowserContext; page: Page; frame: Frame };
	close: () => Promise<void>;
}

const ALICE: TileTestUser = {
	userId: "alice",
	clientId: "client-alice",
	username: "alice",
	displayName: "Alice",
	profilePicture: "https://example.com/alice.png",
};

const BOB: TileTestUser = {
	userId: "bob",
	clientId: "client-bob",
	username: "bob",
	displayName: "Bob",
	profilePicture: "https://example.com/bob.png",
};

function sessionUrl(args: {
	server: TestServer;
	tileTypeId: string;
	instanceId: string;
	user: TileTestUser;
}): string {
	return args.server.sessionUrl({
		tileTypeId: args.tileTypeId,
		instanceId: args.instanceId,
		userId: args.user.userId,
		clientId: args.user.clientId,
		useIndexedDb: true,
	});
}

async function closeContexts(contexts: BrowserContext[]): Promise<void> {
	await Promise.allSettled(contexts.map((context) => context.close()));
}

/**
 * Opens two independent browser contexts on one admitted tile instance.
 * `addUserToInstance` is required: sharing an instanceId alone does not admit
 * the second user to the room or fire the tile's onAddUsers hook.
 */
export async function openTwoUserTile(args: {
	server: TestServer;
	browser: Browser;
	tileTypeId: string;
	instanceId: string;
	readySelector: string;
	contextOptions?: BrowserContextOptions;
	alice?: TileTestUser;
	bob?: TileTestUser;
}): Promise<TwoUserTile> {
	const alice = args.alice ?? ALICE;
	const bob = args.bob ?? BOB;
	const contexts: BrowserContext[] = [];
	try {
		const aliceContext = await args.browser.newContext(args.contextOptions);
		contexts.push(aliceContext);
		const bobContext = await args.browser.newContext(args.contextOptions);
		contexts.push(bobContext);
		await args.server.addUserToInstance({
			storeTypeId: args.tileTypeId,
			instanceId: args.instanceId,
			userId: alice.userId,
			addedBy: alice.userId,
			userInfo: {
				userId: alice.userId,
				username: alice.username,
				displayName: alice.displayName,
				profilePicture: alice.profilePicture,
			},
		});
		await args.server.addUserToInstance({
			storeTypeId: args.tileTypeId,
			instanceId: args.instanceId,
			userId: bob.userId,
			addedBy: alice.userId,
			userInfo: {
				userId: bob.userId,
				username: bob.username,
				displayName: bob.displayName,
				profilePicture: bob.profilePicture,
			},
		});
		const alicePage = await aliceContext.newPage();
		const bobPage = await bobContext.newPage();
		await Promise.all([
			alicePage.goto(
				sessionUrl({
					server: args.server,
					tileTypeId: args.tileTypeId,
					instanceId: args.instanceId,
					user: alice,
				}),
			),
			bobPage.goto(
				sessionUrl({
					server: args.server,
					tileTypeId: args.tileTypeId,
					instanceId: args.instanceId,
					user: bob,
				}),
			),
		]);
		const [aliceFrame, bobFrame] = await Promise.all([
			waitForBlobFrame(alicePage),
			waitForBlobFrame(bobPage),
		]);
		await Promise.all(
			[aliceFrame, bobFrame].map((frame) =>
				expect(frame.locator(args.readySelector)).toBeVisible({
					timeout: 15_000,
				}),
			),
		);

		return {
			alice: { context: aliceContext, page: alicePage, frame: aliceFrame },
			bob: { context: bobContext, page: bobPage, frame: bobFrame },
			close: () => closeContexts(contexts),
		};
	} catch (error) {
		await closeContexts(contexts);
		throw error;
	}
}

export async function expectTileState(args: {
	frame: Frame;
	selector: string;
	state: string;
	timeoutMs?: number;
}): Promise<void> {
	await expect(args.frame.locator(args.selector)).toHaveAttribute(
		"data-state",
		args.state,
		{ timeout: args.timeoutMs ?? 10_000 },
	);
}

/**
 * Assert rejection through the disabled UI state. Playwright intentionally
 * waits rather than clicking disabled controls, so clicking one would turn a
 * correct UI into a test timeout.
 */
export async function expectDisabledAndUnchanged(args: {
	locator: Locator;
	attribute: string;
	value: string;
}): Promise<void> {
	await expect(args.locator).toBeDisabled();
	await expect(args.locator).toHaveAttribute(args.attribute, args.value);
}

/** Wait for a rendered state without hanging on ambient looping decoration. */
export async function waitForVisualReady(args: {
	frame: Frame;
	readySelector: string;
	timeoutMs?: number;
}): Promise<void> {
	const timeout = args.timeoutMs ?? 5000;
	const region = args.frame.locator(args.readySelector);
	await expect(region).toBeVisible({ timeout });
	await expect
		.poll(
			() =>
				region.evaluateAll((elements) => {
					const element = elements[0];
					if (!element) return -1;
					return element
						.getAnimations({ subtree: true })
						.filter((animation) => {
							const endTime = animation.effect?.getComputedTiming().endTime;
							return (
								typeof endTime === "number" &&
								Number.isFinite(endTime) &&
								animation.playState !== "finished" &&
								animation.playState !== "idle"
							);
						}).length;
				}),
			{
				timeout,
				message: `Waiting for finite animations in ${args.readySelector}`,
			},
		)
		.toBe(0);
}
