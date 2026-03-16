import { type Address } from "viem";

/**
 * Application configuration
 *
 * Contract addresses (custody, adjudicator) are fetched automatically from
 * the clearnode via get_config and no longer need manual configuration.
 */
const APP_CONFIG = {
    WEBSOCKET: {
        URL: "wss://clearnet.yellow.com/ws",
    },

    CHAIN_ID: 137,

    TOKENS: {
        137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address,
    },
};

export default APP_CONFIG;
