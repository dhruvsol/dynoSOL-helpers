import { Connection, PublicKey } from "@solana/web3.js";
import {
	getStakePoolAccount,
	ValidatorListLayout,
	type ValidatorList,
} from "@solana/spl-stake-pool";
import fs from "fs";

const main = async () => {
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

	const results: { identity: string; voteAccount: string }[] = [];

	for (const v of vList.validators) {
		const voteAccountInfo = await connection.getAccountInfo(
			v.voteAccountAddress,
		);

		if (!voteAccountInfo) continue;
		v.transientStakeLamports;
		// A Vote account has a known layout from @solana/web3.js utils
		// First 4 bytes: version, next 32: nodePubkey, next 32: authorizedVoter
		const nodePubkey = new PublicKey(voteAccountInfo.data.slice(4, 36));

		results.push({
			identity: nodePubkey.toBase58(),
			voteAccount: v.voteAccountAddress.toBase58(),
		});

		console.log("Find identity account:: ", nodePubkey.toBase58());
	}

	fs.writeFileSync("data.json", JSON.stringify(results, null, 2), "utf8");

	console.log(`Wrote ${results.length} validators to data.json`);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
