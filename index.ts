import axios from "axios";
import data from "./data.json";

const importantEpochs = [805, 806, 807, 823, 824, 825, 796, 795, 797].sort(
	(a, b) => a - b,
);

interface FilteredStakeData {
	// epoch -> Stake
	map: Map<number, number>;
}

interface FilteredIdStakeData {
	// id ---> Map<epoch, stake>
	map: Map<String, FilteredStakeData>;
}

const readData = () => {
	return data;
};

type StakeData = {
	epoch: number;
	stake: number;
};

const getStakeData = async (identity: String): Promise<StakeData[]> => {
	try {
		const stakeDataRes = await axios.post(
			"https://api.vx.tools/epochs/income",
			{
				identity,
				limit: 100,
			},
		);

		return stakeDataRes.data as StakeData[];
	} catch (error) {
		console.error(error);
		return [];
	}
};

const filterEpochData = async (
	data: StakeData[],
): Promise<FilteredStakeData> => {
	const map = new Map();

	for (const epoch of importantEpochs) {
		const stake = data.find((d) => d.epoch === epoch)?.stake || 0;

		map.set(epoch, stake / 1000_000_000);
	}

	return {
		map,
	};
};
const main = async () => {
	const stakeData = await getStakeData(readData()[0].identity);
	const filteredData = await filterEpochData(stakeData);

	console.log(filteredData);
};
main();
