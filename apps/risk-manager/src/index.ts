import {
  IDataRecordTypes,
  ITransferOrder,
  UUID,
  formatTime,
  getDataRecordSchema,
  getDataRecordWrapper,
} from '@yuants/data-model';
import { PromRegistry, Terminal, readDataRecords, useAccountInfo, writeDataRecords } from '@yuants/protocol';
import '@yuants/protocol/lib/services';
import '@yuants/protocol/lib/services/transfer';
import Ajv from 'ajv';
import {
  combineLatest,
  defer,
  delayWhen,
  filter,
  first,
  from,
  groupBy,
  map,
  mergeMap,
  of,
  repeat,
  retry,
  shareReplay,
  tap,
  toArray,
} from 'rxjs';
import { generateCandidateTransfer } from './utils/generateCandidateTransfer';
import { resolveRiskState } from './utils/resolveRiskState';

const terminal = new Terminal(process.env.HOST_URL!, {
  terminal_id: process.env.TERMINAL_ID || 'RiskManager',
  name: 'Risk Manager',
});

const MetricActiveDemand = PromRegistry.create('gauge', 'risk_manager_active_demand');
const MetricPassiveDemand = PromRegistry.create('gauge', 'risk_manager_passive_demand');
const MetricActiveSupply = PromRegistry.create('gauge', 'risk_manager_active_supply');
const MetricPassiveSupply = PromRegistry.create('gauge', 'risk_manager_passive_supply');

function mapRiskInfoToState$(riskInfo: IDataRecordTypes['account_risk_info']) {
  const labels = {
    account_id: riskInfo.account_id,
    group_id: riskInfo.group_id,
    currency: riskInfo.currency,
  };
  return defer(() => useAccountInfo(terminal, riskInfo.account_id)).pipe(
    //
    map((x) => resolveRiskState(riskInfo, x)),
    tap((state) => {
      if (!Number.isNaN(state.active_supply)) {
        MetricActiveSupply.set(state.active_supply, labels);
      } else {
        MetricActiveSupply.reset(labels);
      }
      if (!Number.isNaN(state.passive_supply)) {
        MetricPassiveSupply.set(state.passive_supply, labels);
      } else {
        MetricPassiveSupply.reset(labels);
      }
      if (!Number.isNaN(state.active_demand)) {
        MetricActiveDemand.set(state.active_demand, labels);
      } else {
        MetricActiveDemand.reset(labels);
      }
      if (!Number.isNaN(state.passive_demand)) {
        MetricPassiveDemand.set(state.passive_demand, labels);
      } else {
        MetricPassiveDemand.reset(labels);
      }
    }),
  );
}

const ajv = new Ajv({ strict: false });
const validator = ajv.compile(getDataRecordSchema('account_risk_info')!);

const configs$ = defer(() => readDataRecords(terminal, { type: 'account_risk_info' })).pipe(
  mergeMap((x) => x),
  map((x) => x.origin),
  filter((x) => !x.disabled),
  filter((x) => validator(x)),
  toArray(),
  retry({ delay: 5000 }),
  shareReplay(1),
);

defer(() => configs$)
  .pipe(
    mergeMap((x) => x),
    tap((x) => {
      // Keep AccountInfo in subscription
      from(useAccountInfo(terminal, x.account_id)).subscribe();
    }),
    groupBy((x) => x.currency),
    mergeMap((groupByCurrency) =>
      groupByCurrency.pipe(
        groupBy((x) => x.group_id),
        mergeMap((groupByGroup) =>
          groupByGroup.pipe(
            toArray(),
            mergeMap((x) =>
              defer(() => combineLatest(x.map((riskInfo) => mapRiskInfoToState$(riskInfo)))).pipe(
                first(),
                tap((list) => {
                  console.info(
                    formatTime(Date.now()),
                    groupByCurrency.key,
                    groupByGroup.key,
                    'decision stage',
                    list.length,
                  );
                  console.table(list);
                }),
                mergeMap(generateCandidateTransfer),
                filter((x): x is Exclude<typeof x, undefined> => !!x),
                first((x) => x.amount > 0),
                tap((x) =>
                  console.info(
                    formatTime(Date.now()),
                    groupByCurrency.key,
                    groupByGroup.key,
                    'transfer',
                    JSON.stringify(x),
                  ),
                ),
                map(
                  (x): ITransferOrder => ({
                    order_id: UUID(),
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    credit_account_id: x.credit,
                    debit_account_id: x.debit,
                    expected_amount: x.amount,
                    currency: x.currency,
                    status: 'INIT',
                    timeout_at: Date.now() + 1000 * 600,
                  }),
                ),
                delayWhen((order) =>
                  from(writeDataRecords(terminal, [getDataRecordWrapper('transfer_order')!(order)])),
                ),
                tap((x) =>
                  console.info(
                    formatTime(Date.now()),
                    groupByCurrency.key,
                    groupByGroup.key,
                    'transfer order created',
                    JSON.stringify(x),
                  ),
                ),
                delayWhen((transfer_order) =>
                  defer(() =>
                    readDataRecords(terminal, { type: 'transfer_order', id: transfer_order.order_id }),
                  ).pipe(
                    //
                    mergeMap((records) => {
                      if (records.length === 0) {
                        throw new Error(`Transfer Order ${transfer_order.order_id} not found`);
                      }
                      const record = records[0];
                      if (!['ERROR', 'COMPLETE'].includes(record.origin.status)) {
                        throw new Error(`Transfer Order ${transfer_order.order_id} failed`);
                      }
                      return of(void 0);
                    }),
                    retry({ delay: 1000 }),
                  ),
                ),
                tap((x) =>
                  console.info(
                    formatTime(Date.now()),
                    groupByCurrency.key,
                    groupByGroup.key,
                    'transfer order finished',
                    JSON.stringify(x),
                  ),
                ),
                repeat({ delay: 1000 }),
                retry({ delay: 1000 }),
              ),
            ),
          ),
        ),
      ),
    ),
  )
  .subscribe();
