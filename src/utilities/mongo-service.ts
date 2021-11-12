
import { MongoClient, Database } from "https://deno.land/x/mongo/mod.ts"
import { IPersistenceService, AccountInfoSchema, DealSchema, LogSchema } from "../interfaces/persistence.ts";
import { GeneralUtilityBox } from "./general-utility-box.ts";


export class MongoService implements IPersistenceService {

    public static async saveAccountInfoCash(mongoService: IPersistenceService | undefined, accountInfoCash: AccountInfoSchema) {
        try {
            if (mongoService !== undefined) {
                await mongoService.updateAccountInfo(accountInfoCash)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }

    }

    public static async deleteOldLogEntries(mongoService: IPersistenceService | undefined, apiKey: string) {
        try {
            if (mongoService !== undefined) {
                await mongoService.deleteOldLogs(apiKey)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }

    }

    public static async deleteOldDealEntries(mongoService: IPersistenceService | undefined, apiKey: string, deleteDealEntriesAfterXHours: number = 1829) {
        try {
            if (mongoService !== undefined) {
                await mongoService.deleteOldDeals(apiKey, deleteDealEntriesAfterXHours)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }

    }


    public static async deleteAccountInfoCash(mongoService: IPersistenceService | undefined, accountInfoCash: AccountInfoSchema) {
        try {
            if (mongoService !== undefined) {
                await mongoService.updateAccountInfo(accountInfoCash)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }

    }

    public static async deleteLogEntries(mongoService: IPersistenceService | undefined, apiKey: string) {
        try {
            if (mongoService !== undefined) {
                await mongoService.deleteOldLogs(apiKey)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }

    }

    public static async deleteDealEntries(mongoService: IPersistenceService | undefined, apiKey: string, deleteDealEntriesAfterXHours: number) {
        try {
            if (mongoService !== undefined) {
                await mongoService.deleteOldDeals(apiKey, deleteDealEntriesAfterXHours)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }

    }

    public static async saveDeal(mongoService: IPersistenceService | undefined, deal: DealSchema) {
        try {
            if (mongoService !== undefined) {
                await mongoService.saveDeal(deal)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)

        }
    }
    public static async saveLog(mongoService: IPersistenceService | undefined, log: LogSchema) {
        try {
            if (mongoService !== undefined) {
                await mongoService.saveLog(log)
            }
        } catch (error) {
            const message = `shit happened wrt database: ${error.message}`
            console.log(message)
        }
    }

    private static client = new MongoClient()
    private static db: Database
    private static accountInfosCollection: any
    private static dealCollection: any
    private static logCollection: any
    private initialized = false


    public constructor(private mongoDBConnectionURL: string) { }

    public async dropCollection(collectionName: string): Promise<any> {

        if (!this.initialized) await this.initialize()

        const collectionToBeDropped = MongoService.db.collection<AccountInfoSchema>(collectionName)

        await collectionToBeDropped.drop()

    }

    public async initialize() {

        await MongoService.client.connect(this.mongoDBConnectionURL)

        MongoService.db = MongoService.client.database("openforce")

        MongoService.accountInfosCollection = MongoService.db.collection<AccountInfoSchema>("accountInfos")
        MongoService.dealCollection = MongoService.db.collection<DealSchema>("deals")
        MongoService.logCollection = MongoService.db.collection<DealSchema>("logs")

        console.log(MongoService.db)

        this.initialized = true

    }

    public async saveDeal(deal: DealSchema): Promise<any> {

        if (!this.initialized) await this.initialize()


        const insertId = await MongoService.dealCollection.insertOne({
            apiKey: deal.apiKey,
            utcTime: deal.utcTime,
            action: deal.action,
            asset: deal.asset,
            reason: deal.reason,
            reduceOnly: deal.reduceOnly,
            equityBeforeThisDeal: deal.equityBeforeThisDeal
        })

        return insertId

    }


    public async saveLog(log: LogSchema): Promise<any> {

        if (!this.initialized) await this.initialize()

        const insertId = await MongoService.logCollection.insertOne({
            apiKey: log.apiKey,
            utcTime: log.utcTime,
            message: log.message
        })

        return insertId

    }


    public async readDeals(apiKey?: string): Promise<any[]> {

        if (!this.initialized) await this.initialize()

        if (apiKey === undefined) {
            return MongoService.dealCollection.find({}).sort({ utcTime: -1 }).toArray()
        }

        // return MongoService.dealCollection.findOne({ apiKey: "123" })
        return MongoService.dealCollection.find({ apiKey }).sort({ utcTime: -1 }).toArray()

    }


    public async readLogs(apiKey: string): Promise<any[]> {

        if (!this.initialized) await this.initialize()

        // return MongoService.logCollection.find({ apiKey }).limit(6).toArray()
        return MongoService.logCollection.find({ apiKey }).sort({ utcTime: -1 }).limit(6).toArray()

    }

    public async deleteOldLogs(apiKey: string): Promise<any[]> {

        if (!this.initialized) await this.initialize()

        const refDate = new Date();
        refDate.setHours(refDate.getHours() - 8);

        console.log(refDate.toISOString())

        console.log(`deleting all log entries older than ${refDate}`)

        return MongoService.logCollection.deleteMany({ apiKey, utcTime: { $lte: refDate.toISOString() } })

    }

    public async deleteOldDeals(apiKey: string, deleteDealEntriesAfterXHours: number): Promise<any[]> {

        if (!this.initialized) await this.initialize()


        const refDate = GeneralUtilityBox.subtractXHoursFromDate(deleteDealEntriesAfterXHours, new Date())

        console.log(refDate.toISOString())

        console.log(`deleting all deal entries older than ${refDate}`)

        return MongoService.dealCollection.deleteMany({ apiKey, utcTime: { $lte: refDate.toISOString() } })

    }


    public async deleteAccountInfoCash(apiKey: string): Promise<void> {
        await MongoService.accountInfosCollection.delete({ apiKey })
    }

    public async deleteDeals(apiKey: string): Promise<void> {
        await MongoService.dealCollection.delete({ apiKey })
    }

    public async deleteLogs(apiKey: string): Promise<void> {
        await MongoService.logCollection.delete({ apiKey })
    }


    public async updateAccountInfo(accountInfo: AccountInfoSchema): Promise<any> {

        if (!this.initialized) await this.initialize()

        const insertId = await MongoService.accountInfosCollection.updateOne({ apiKey: accountInfo.apiKey }, {
            apiKey: accountInfo.apiKey,
            equity: accountInfo.equity,
            avaliableBalance: accountInfo.avaliableBalance,
            longPositionSize: accountInfo.longPositionSize,
            longPositionPNLInPercent: accountInfo.longPositionPNLInPercent,
            shortPositionSize: accountInfo.shortPositionSize,
            shortPositionPNLInPercent: accountInfo.shortPositionPNLInPercent,
            longShortDeltaInPercent: accountInfo.longShortDeltaInPercent,
            overallUnrealizedPNL: accountInfo.overallUnrealizedPNL,
            stabilityPositionSize: accountInfo.stabilityPositionSize,
            stabilityPositionPNL: accountInfo.stabilityPositionPNL,
            botStatus: accountInfo.botStatus,
            strategy: accountInfo.strategy
        }, { upsert: true })

        return insertId

    }


    public async readAccountInfo(apiKey?: string): Promise<any | any[]> {

        if (!this.initialized) await this.initialize()

        if (apiKey === undefined) {
            return MongoService.accountInfosCollection.find({}).toArray()
        }

        const entry = await MongoService.accountInfosCollection.findOne({ apiKey })

        if (entry === undefined) {
            return { message: `I could not find any data for ${apiKey}` }
        }

        return entry

    }

}