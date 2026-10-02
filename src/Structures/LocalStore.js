const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_DATA_DIRECTORY = path.join(__dirname, '../../data');
const operations = new Map();

function matches(record, query) {
  return Object.entries(query).every(([key, value]) => record[key] === value);
}

function toRecord(document) {
  return Object.fromEntries(Object.entries(document).filter(([, value]) => typeof value !== 'function'));
}

function createLocalModel(fileName, dateFields = [], dataDirectory = DEFAULT_DATA_DIRECTORY) {
  const filePath = path.join(dataDirectory, fileName);

  function transact(callback) {
    const previous = operations.get(filePath) || Promise.resolve();
    const operation = previous.then(async () => {
      let records;
      try {
        records = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        records = [];
      }

      const { result, changed = false } = await callback(records);
      if (changed) {
        await fs.mkdir(dataDirectory, { recursive: true });
        const temporaryPath = `${filePath}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(records, null, 2));
        await fs.rename(temporaryPath, filePath);
      }
      return result;
    });

    operations.set(filePath, operation.catch(() => {}));
    return operation;
  }

  function hydrate(record) {
    if (!record) return null;
    const document = new LocalDocument(record);
    for (const field of dateFields) {
      if (document[field] != null) document[field] = new Date(document[field]);
    }
    return document;
  }

  class LocalDocument {
    constructor(data = {}) {
      Object.assign(this, data);
      if (!this._id) this._id = randomUUID();
    }

    async save() {
      return transact(records => {
        const record = toRecord(this);
        const index = records.findIndex(item => item._id === this._id);
        if (index === -1) records.push(record);
        else records[index] = record;
        return { result: this, changed: true };
      });
    }

    async delete() {
      return transact(records => {
        const index = records.findIndex(item => item._id === this._id);
        if (index === -1) return { result: { deletedCount: 0 } };
        records.splice(index, 1);
        return { result: { deletedCount: 1 }, changed: true };
      });
    }

    static async find(query = {}) {
      return transact(records => ({ result: records.filter(record => matches(record, query)).map(hydrate) }));
    }

    static async findOne(query = {}) {
      return transact(records => ({ result: hydrate(records.find(record => matches(record, query))) }));
    }

    static async updateOne(query, update) {
      return transact(records => {
        const record = records.find(item => matches(item, query));
        if (!record) return { result: { matchedCount: 0, modifiedCount: 0 } };

        for (const [field, value] of Object.entries(update.$set || {})) record[field] = value;
        for (const [field, amount] of Object.entries(update.$inc || {})) {
          record[field] = (Number(record[field]) || 0) + amount;
        }
        for (const [field, value] of Object.entries(update)) {
          if (!field.startsWith('$')) record[field] = value;
        }
        return { result: { matchedCount: 1, modifiedCount: 1 }, changed: true };
      });
    }
  }

  return LocalDocument;
}

module.exports = createLocalModel;