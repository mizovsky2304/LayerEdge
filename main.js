import fs from 'fs/promises';
import axios from "axios";
import chalk from "chalk";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Wallet } from "ethers";

// Enhanced modern logger
const logger = {
    _formatTimestamp() {
        return chalk.gray(`${new Date().toLocaleTimeString()}`);
    },

    _getLevelStyle(level) {
        const styles = {
            info: chalk.blueBright.bold,
            warn: chalk.yellowBright.bold,
            error: chalk.redBright.bold,
            success: chalk.greenBright.bold,
            debug: chalk.magentaBright.bold
        };
        return styles[level] || chalk.white;
    },

    log(level, message, value = '') {
        const timestamp = this._formatTimestamp();
        const levelStyle = this._getLevelStyle(level);
        const levelTag = levelStyle(`${level.toUpperCase()}`);

        const formattedMessage = `${timestamp} ${levelTag} ${message}`;

        let formattedValue = '';
        if (value) {
            switch(level) {
                case 'error':
                    formattedValue = chalk.red(`✘ ${value}`);
                    break;
                case 'warn':
                    formattedValue = chalk.yellow(`⚠ ${value}`);
                    break;
                case 'success':
                    formattedValue = chalk.green(`✔ ${value}`);
                    break;
                default:
                    formattedValue = chalk.green(`➤ ${value}`);
            }
        }

        console.log(`${formattedMessage}${formattedValue}`);
    },

    info: (message, value = '') => logger.log('info', message, value),
    warn: (message, value = '') => logger.log('warn', message, value),
    error: (message, value = '') => logger.log('error', message, value),
    success: (message, value = '') => logger.log('success', message, value),
    debug: (message, value = '') => logger.log('debug', message, value),

    progress(wallet, step, status) {
        const progressStyle = status === 'success' 
            ? chalk.green('✅') 
            : status === 'failed' 
            ? chalk.red('❌') 
            : chalk.yellow('➡️');
        
        console.log(
            chalk.gray(`${new Date().toLocaleTimeString()}`),
            chalk.blueBright('Progress'),
            `${progressStyle} ${wallet} - ${step}`
        );
    }
};

// Helper functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * 1000));
}

async function saveToFile(filename, data) {
    try {
        await fs.appendFile(filename, `${data}\n`, 'utf-8');
        logger.info(`Data saved to ${filename}`);
    } catch (error) {
        logger.error(`Failed to save data to ${filename}: ${error.message}`);
    }
}

async function readFile(pathFile) {
    try {
        const datas = await fs.readFile(pathFile, 'utf8');
        return datas.split('\n')
            .map(data => data.trim())
            .filter(data => data.length > 0);
    } catch (error) {
        logger.error(`Error reading file: ${error.message}`);
        return [];
    }
}

const newAgent = (proxy = null) => {
    if (proxy) {
        if (proxy.startsWith('http://')) {
            return new HttpsProxyAgent(proxy);
        } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
            return new SocksProxyAgent(proxy);
        } else {
            logger.warn(`Unsupported proxy type: ${proxy}`);
            return null;
        }
    }
    return null;
};

// LayerEdge connection class
class LayerEdgeConnection {
  constructor(proxy = null, privateKey = null, refCode = "mWJ5uQp5") {
    this.refCode = refCode;
    this.proxy = proxy;

    this.axiosConfig = {
      ...(this.proxy && { httpsAgent: newAgent(this.proxy) }),
      timeout: 60000,
    };

    this.wallet = privateKey ? new Wallet(privateKey) : Wallet.createRandom();
  }

  getWallet() {
    return this.wallet;
  }

  async makeRequest(method, url, config = {}, retries = 30) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios({
          method,
          url,
          ...this.axiosConfig,
          ...config,
        });
        return response;
      } catch (error) {
        if (i === retries - 1) {
          logger.error(`Max retries reached - request failed:`, error.message);
          if (this.proxy) {
            logger.error(`Failed proxy: ${this.proxy}, ${error.message}`);
          }
          return null;
        }

        process.stdout.write(
          chalk.yellow(
            `Request failed: ${error.message} => Retrying... (${
              i + 1
            }/${retries})\r`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return null;
  }

  async checkInvite() {
    const inviteData = {
      invite_code: this.refCode,
    };

    const response = await this.makeRequest(
      "post",
      "https://referral-api.layeredge.io/api/referral/verify-referral-code",
      { data: inviteData }
    );

    if (response && response.data && response.data.data.valid === true) {
      logger.info("Invite Code Valid", response.data);
      return true;
    } else {
      logger.error("Failed to check invite");
      return false;
    }
  }

  async registerWallet() {
    const registerData = {
      walletAddress: this.wallet.address,
    };

    const response = await this.makeRequest(
      "post",
      `https://referral-api.layeredge.io/api/referral/register-wallet/${this.refCode}`,
      { data: registerData }
    );

    if (response && response.data) {
      logger.info("Wallet successfully registered", response.data);
      return true;
    } else {
      logger.error("Failed To Register wallets", "error");
      return false;
    }
  }

  async connectNode() {
    const timestamp = Date.now();
    const message = `Node activation request for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);

    const dataSign = {
      sign: sign,
      timestamp: timestamp,
    };

    const response = await this.makeRequest(
      "post",
      `https://referral-api.layeredge.io/api/light-node/node-action/${this.wallet.address}/start`,
      { data: dataSign }
    );

    if (
      response &&
      response.data &&
      response.data.message === "node action executed successfully"
    ) {
      logger.info("Connected Node Successfully", response.data);
      return true;
    } else {
      logger.info("Failed to connect Node");
      return false;
    }
  }

  async stopNode() {
    const timestamp = Date.now();
    const message = `Node deactivation request for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);

    const dataSign = {
      sign: sign,
      timestamp: timestamp,
    };

    const response = await this.makeRequest(
      "post",
      `https://referral-api.layeredge.io/api/light-node/node-action/${this.wallet.address}/stop`,
      { data: dataSign }
    );

    if (response && response.data) {
      logger.info("Stop and Claim Points Result:", response.data);
      return true;
    } else {
      logger.error("Failed to Stopping Node and claiming points");
      return false;
    }
  }

  async checkNodeStatus() {
    const response = await this.makeRequest(
      "get",
      `https://referral-api.layeredge.io/api/light-node/node-status/${this.wallet.address}`
    );

    if (
      response &&
      response.data &&
      response.data.data.startTimestamp !== null
    ) {
      logger.info("Node Status Running", response.data);
      return true;
    } else {
      logger.error("Node not running trying to start node...");
      return false;
    }
  }

  async checkNodePoints() {
    const response = await this.makeRequest(
      "get",
      `https://referral-api.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
    );

    if (response && response.data) {
      logger.info(
        `${this.wallet.address} Total Points:`,
        response.data.data?.nodePoints || 0
      );
      return true;
    } else {
      logger.error("Failed to check Total Points..");
      return false;
    }
  }
}

// Helper function: read wallets.txt
async function readWallets() {
    try {
        const data = await fs.readFile("wallets.txt", "utf-8");
        const wallets = data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const [address, privateKey] = line.split(',');
                return { address, privateKey };
            });

        return wallets;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info("No wallets found in wallets.txt");
            return [];
        }
        logger.error(`Failed to read wallets.txt: ${error.message}`);
        return [];
    }
}

async function run() {
    logger.info('Starting LayerEdge Node Bot', 'Initializing...');
    await delay(3);

    const proxies = await readFile('proxy.txt');
    let wallets = await readWallets();
    
    if (proxies.length === 0) logger.warn('No proxies', 'Running without proxy support');
    if (wallets.length === 0) {
        logger.error('Missing wallet configuration', 'Ensure wallets.txt exists and is correctly formatted');
        return;
    }

    logger.info('Processing wallets', `Total wallets: ${wallets.length}`);

    while (true) {
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const proxy = proxies[i % proxies.length] || null;
            const { address, privateKey } = wallet;
            
            try {
                const socket = new LayerEdgeConnection(proxy, privateKey);
                
                logger.progress(address, 'Wallet processing started', 'start');
                logger.info(`Wallet details`, `Address: ${address}, Proxy: ${proxy || 'No proxy'}`);

                logger.progress(address, 'Checking node status', 'processing');
                const isRunning = await socket.checkNodeStatus();

                if (isRunning) {
                    logger.progress(address, 'Claiming node points', 'processing');
                    await socket.stopNode();
                }

                logger.progress(address, 'Reconnecting node', 'processing');
                await socket.connectNode();

                logger.progress(address, 'Checking node points', 'processing');
                await socket.checkNodePoints();

                logger.progress(address, 'Wallet processing complete', 'success');
            } catch (error) {
                logger.progress(address, 'Wallet processing failed', 'failed');
                logger.error('Wallet processing error', error.message);
            }
        }
        
        logger.warn('Loop completed', 'Waiting for 1 hour before next run...');
        await delay(60 * 60);
    }
}

// Start script
run();
