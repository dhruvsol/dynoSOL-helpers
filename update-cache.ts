import { Redis } from "@upstash/redis";
import { config } from "dotenv";
import data from "./data.json";
import { Connection, PublicKey, STAKE_CONFIG_ID } from "@solana/web3.js";
import {
	getStakePoolAccount,
	ValidatorListLayout,
	type ValidatorList,
} from "@solana/spl-stake-pool";
import axios from "axios";
import fs from "fs";
type CacheStruct = {
	validatorKeys: {
		identity: string;
		voteAccount: string;
	};
	logo: string;
	name: string;
	currentStake: number;
	transientStakeLamports: number;
	currentStakeFromPool: number;
};
function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
const main = async () => {
	config();
	let dataToCache: CacheStruct[] = [];

	const dataTyped = data as {
		identity: string;
		voteAccount: string;
	}[];

	const rpc_url = process.env.RPC_URL as string;
	if (!rpc_url || rpc_url.length < 2) {
		throw new Error("RPC_URL environment variable is not set");
	}
	const connection = new Connection(rpc_url, "confirmed");

	const stakePoolPk = new PublicKey(
		"DpooSqZRL3qCmiq82YyB4zWmLfH3iEqx2gy8f2B6zjru",
	);

	const sp = await getStakePoolAccount(connection, stakePoolPk);

	const validatorListInfo = await connection.getAccountInfo(
		sp.account.data.validatorList,
	);
	if (!validatorListInfo) throw new Error("ValidatorList account not found");

	const vList = ValidatorListLayout.decode(
		validatorListInfo.data,
	) as ValidatorList;

	for (const i of dataTyped) {
		const validatorStakeData = vList.validators.find(
			(el) =>
				el.voteAccountAddress.toBase58().toLocaleLowerCase() ===
				i.voteAccount.toLocaleLowerCase(),
		);

		if (!validatorStakeData) {
			continue;
		}

		// removing validators with no stake
		if (validatorStakeData.activeStakeLamports.toNumber() < 1) {
			continue;
		}

		const stakewiz = await axios.get(
			`https://api.stakewiz.com/validator/${validatorStakeData.voteAccountAddress.toBase58()}`,
		);

		let p: CacheStruct = {
			validatorKeys: {
				identity: i.identity,
				voteAccount: i.voteAccount,
			},
			currentStake: parseInt(
				(stakewiz.data.activated_stake * 1000_000_000).toFixed(0),
			),
			transientStakeLamports:
				validatorStakeData.transientStakeLamports.toNumber(),
			logo: stakewiz.data.image,
			name: stakewiz.data.name,
			currentStakeFromPool: validatorStakeData.activeStakeLamports.toNumber(),
		};

		dataToCache.push(p);
		console.log("vote account cache: ", p.validatorKeys.voteAccount);
		await delay(2000);
	}

	fs.writeFileSync(
		"data-to-cache.json",
		JSON.stringify(dataToCache, null, 2),
		"utf8",
	);

	const redis = new Redis({
		url: process.env.UPSTASH_URL,
		token: process.env.UPSTASH_TOKEN,
	});

	redis.set("pool-data", JSON.stringify(dataToCache));
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
