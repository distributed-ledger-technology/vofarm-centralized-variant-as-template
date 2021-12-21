import { IExchangeConnector } from "../../deps.ts";
import { Action, InvestmentAdvice, AssetInfo, LogLevel } from "../../mod.ts"
import { FinancialCalculator } from "../utilities/financial-calculator.ts"
import { VFLogger } from "../utilities/logger.ts";

import { VoFarmStrategy } from "./vofarm-strategy.ts";

export abstract class LongShortClassics extends VoFarmStrategy {

    protected overallLSD: number = 0
    protected overallPNL: number = 0

    protected assetInfos: AssetInfo[]

    public constructor(logger: VFLogger) {
        super(logger)
        this.assetInfos = this.getAssetsToPlayWith()
    }

    public async getInvestmentAdvices(input: any): Promise<InvestmentAdvice[]> {

        this.currentInvestmentAdvices = []

        if (input.fundamentals === undefined) {
            await this.collectFundamentals(input.exchangeConnector)
        } else {
            this.fundamentals.accountInfo = input.fundamentals.accountInfo
            this.fundamentals.positions = input.fundamentals.positions
        }

        this.liquidityLevel = (this.fundamentals.accountInfo.result.USDT.available_balance / this.fundamentals.accountInfo.result.USDT.equity) * 20

        this.overallLSD = this.getOverallLSD()

        this.logger.log(`overallLSD: ${this.overallLSD.toFixed(2)}`, 1)

        for (const assetInfo of this.assetInfos) {

            try {
                await this.playAsset(assetInfo, input.exchangeConnector)
            } catch (error) {
                this.logger.log(`strange situation while playing ${assetInfo.pair}: ${error}`, 2)
            }

        }

        return this.currentInvestmentAdvices

    }


    protected async playAsset(assetInfo: AssetInfo, exchangeConnector: IExchangeConnector): Promise<void> {

        let longPosition = this.fundamentals.positions.filter((p: any) => p.data.side === 'Buy' && p.data.symbol === assetInfo.pair)[0]
        let shortPosition = this.fundamentals.positions.filter((p: any) => p.data.side === 'Sell' && p.data.symbol === assetInfo.pair)[0]
        let longShortDeltaInPercent = FinancialCalculator.getLongShortDeltaInPercent(this.fundamentals.positions, assetInfo.pair)

        if (longPosition !== undefined && shortPosition !== undefined && (longPosition.data.leverage < 25 || shortPosition.data.leverage < 25)) {
            await exchangeConnector.setLeverage(assetInfo.pair, 25)
        }

        try {
            this.overallPNL = FinancialCalculator.getOverallPNLInPercent(longPosition, shortPosition)
        } catch (error) {
            this.logger.log(error.message, 2)
        }

        this.logger.log(`${assetInfo.pair} oPNL: ${this.overallPNL.toFixed(2)} (l: ${longPosition.data.unrealised_pnl.toFixed(2)} s: ${shortPosition.data.unrealised_pnl.toFixed(2)}) - lsd: ${longShortDeltaInPercent.toFixed(2)}`, 2)

        if (longPosition === undefined || shortPosition === undefined) {
            this.ensureLongShortSetup(assetInfo, longPosition, shortPosition)
        } else if (this.liquidityLevel > 2 && longPosition.data.unrealised_pnl < 0 && shortPosition.data.unrealised_pnl < 0) {
            this.narrowLongShortDiffPNL(assetInfo)
        }


        let pnlLong = FinancialCalculator.getPNLOfPositionInPercent(longPosition)

        let aPL = this.getAddingPointLong(assetInfo, longShortDeltaInPercent, this.liquidityLevel)

        this.logger.log(`${assetInfo.pair} aPL: ${aPL.toFixed(2)} (${pnlLong})`, LogLevel.INFO)

        if (pnlLong < aPL) {
            const reason = `we enhance our ${assetInfo.pair} long position (at a pnl of: ${pnlLong}%) by ${assetInfo.minTradingAmount}`
            this.addInvestmentAdvice(Action.BUY, assetInfo.minTradingAmount, assetInfo.pair, reason)
        }


        let pnlShort = FinancialCalculator.getPNLOfPositionInPercent(shortPosition)

        let aPS = this.getAddingPointShort(assetInfo, longShortDeltaInPercent, this.liquidityLevel)

        this.logger.log(`${assetInfo.pair} aPS: ${aPS.toFixed(2)} (${pnlShort})`, LogLevel.INFO)

        if (pnlShort < aPS) {

            const reason = `we enhance our ${assetInfo.pair} short position (at a pnl of: ${pnlShort}%) by ${assetInfo.minTradingAmount}`
            this.addInvestmentAdvice(Action.SELL, assetInfo.minTradingAmount, assetInfo.pair, reason)
        }


        let cPL = this.getClosingPointLong(assetInfo, longShortDeltaInPercent, this.liquidityLevel)

        this.logger.log(`${assetInfo.pair} cPL: ${cPL.toFixed(2)} (${pnlLong})`, LogLevel.INFO)

        if (pnlLong > cPL && longPosition !== undefined && longPosition.data.size > assetInfo.minTradingAmount) {
            const reason = `we reduce our ${assetInfo.pair} long position to realize ${pnlLong}% profits`
            this.addInvestmentAdvice(Action.REDUCELONG, assetInfo.minTradingAmount, assetInfo.pair, reason)
        }



        let cPS = this.getClosingPointShort(assetInfo, longShortDeltaInPercent, this.liquidityLevel)

        this.logger.log(`${assetInfo.pair} cPS: ${cPS.toFixed(2)} (${pnlShort})`, LogLevel.INFO)

        if (pnlShort > cPS && shortPosition !== undefined && shortPosition.data.size > assetInfo.minTradingAmount) {
            const reason = `we reduce our ${assetInfo.pair} short position to realize ${pnlShort}% profits`
            this.addInvestmentAdvice(Action.REDUCESHORT, assetInfo.minTradingAmount, assetInfo.pair, reason)
        }

    }


    protected getAddingPointLong(assetInfo: AssetInfo, lsd: number, ll: number): number {

        if (ll > 2 && lsd < assetInfo.minLSD) {
            return 200000
        }

        if (ll > 0.5 && lsd < assetInfo.maxLSD) {
            return lsd * -2
        }

        return -200000

    }


    protected getAddingPointShort(assetInfo: AssetInfo, lsd: number, ll: number): number {

        if (ll > 2 && lsd > assetInfo.maxLSD) {
            return 200000
        }

        if (ll > 0.5 && lsd > assetInfo.minLSD) {
            return -72 + lsd * 2
        }

        return -200000

    }


    protected getClosingPointLong(assetInfo: AssetInfo, lsd: number, ll: number): number {

        if (ll < 0.01) {
            return -200000
        }

        if (ll < 0.3 && this.overallLSD > 100) {
            return 36
        }

        if (lsd > assetInfo.targetLSD) {
            return 100 - lsd
        }

        return 200000
    }


    protected getClosingPointShort(assetInfo: AssetInfo, lsd: number, ll: number): number {
        if (ll < 0.01) {
            return -200000
        }

        if (ll < 0.3 && this.overallLSD < 1000) {
            return 36
        }

        if (lsd < assetInfo.targetLSD) {
            return 100 + lsd
        }

        return 200000
    }


    protected isPreviousAdviceOlderThanXMinutes(minutes: number): boolean {

        const refDate = new Date()

        refDate.setMinutes(refDate.getMinutes() - minutes)

        if (this.lastAdviceDate < refDate) {
            const message = `lastAdviceDate :${this.lastAdviceDate} vs. refDate: ${refDate}`
            this.logger.log(message, 0)
            return true
        }

        return false
    }



    protected getAssetsToPlayWith(): AssetInfo[] {
        return [
            { pair: "ETHUSDT", minTradingAmount: 0.01, decimalPlaces: 2, targetLSD: 20, minLSD: 5, maxLSD: 50 },
            { pair: "ENSUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 20, minLSD: 5, maxLSD: 50 },
            { pair: "BTCUSDT", minTradingAmount: 0.001, decimalPlaces: 3, targetLSD: 10, minLSD: 2, maxLSD: 30 },
            { pair: "UNIUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 10, minLSD: 2, maxLSD: 30 },
            { pair: "LINKUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 10, minLSD: -10, maxLSD: 30 },
            { pair: "BNBUSDT", minTradingAmount: 0.01, decimalPlaces: 2, targetLSD: 0, minLSD: -20, maxLSD: 20 },
            { pair: "SOLUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 20 },
            { pair: "ADAUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 20 },
            { pair: "DOTUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 20 },
            { pair: "LUNAUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "BATUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "FILUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "XLMUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "MANAUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ICPUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "VETUSDT", minTradingAmount: 10, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "AAVEUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "COMPUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "XTZUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "THETAUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ETCUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "HBARUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "EGLDUSDT", minTradingAmount: 0.01, decimalPlaces: 2, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ATOMUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "TRXUSDT", minTradingAmount: 10, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ALGOUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "BCHUSDT", minTradingAmount: 0.01, decimalPlaces: 2, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "MATICUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "DOGEUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "XRPUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "LTCUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "SANDUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "BITUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "IOTXUSDT", minTradingAmount: 10, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "DYDXUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "SUSHIUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "CRVUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ENJUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "AXSUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "FTMUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "GALAUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "EOSUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "LRCUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "GRTUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "FLOWUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "KSMUSDT", minTradingAmount: 0.1, decimalPlaces: 1, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ZECUSDT", minTradingAmount: 0.01, decimalPlaces: 2, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "ONEUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "RUNEUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
            { pair: "CHZUSDT", minTradingAmount: 1, decimalPlaces: 0, targetLSD: 0, minLSD: -20, maxLSD: 15 },
        ]
    }

}

