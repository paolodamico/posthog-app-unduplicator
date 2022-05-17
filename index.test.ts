import { Plugin, PluginMeta } from '@posthog/plugin-scaffold'
// @ts-ignore
import { createPageview, resetMeta } from '@posthog/plugin-scaffold/test/utils'
import { createHash } from 'crypto'
import given from 'given2'

import * as unduplicatesPlugin from '.'
const { processEvent } = unduplicatesPlugin as Required<Plugin>

given('getResponse', () => ({ results: [], next: null }))

global.posthog = {
    api: {
        get: jest.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve(given.getResponse),
            })
        ),
    },
}

const defaultMeta = {
    config: {
        dedupMode: 'Event and Timestamp',
    },
}

describe('basic functionality', () => {
    test('unduplicated event is processed normally', async () => {
        const meta = resetMeta() as PluginMeta<Plugin>
        const event = await processEvent({ ...createPageview(), timestamp: '2020-02-02T23:59:59.999999Z' }, meta)
        expect(event!.event).toEqual('$pageview')
        expect(event!.properties).toEqual(
            expect.objectContaining({
                distinct_id: 'scbbAqF7uyrMmamV4QBzcA1rrm9wHNISdFweZz-mQ0',
                $os: 'Mac OS X',
                $lib: 'web',
            })
        )

        // Event is temporarily stored in cache for faster comparisons
        const hash = createHash('sha1')
        expect(
            await meta.cache.get(hash.update(`13_007_$pageview_2020-02-02T23:59:59.999999Z`).digest('hex'), null)
        ).toBeTruthy()
    })
})

describe('cache-based deduplication', () => {
    test('duplicated event from cache is skipped', async () => {
        const meta = resetMeta() as PluginMeta<Plugin>
        const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

        const event = await processEvent(eventToInsert, meta)
        expect(event!.event).toEqual('$pageview')
        expect(event!.timestamp).toEqual('2020-01-01T23:59:59.999999Z')
        expect(event!.properties).toEqual(
            expect.objectContaining({
                distinct_id: 'scbbAqF7uyrMmamV4QBzcA1rrm9wHNISdFweZz-mQ0',
                $os: 'Mac OS X',
                $lib: 'web',
            })
        )

        // Try to insert duplicate event
        const duplicateEvent = await processEvent(eventToInsert, meta)
        expect(duplicateEvent).toBeNull() // <- Duplicate event is ignored

        // Event remains in the cache
        const hash = createHash('sha1')
        expect(
            await meta.cache.get(hash.update(`13_007_$pageview_2020-01-01T23:59:59.999999Z`).digest('hex'), null)
        ).toBeTruthy()
    })

    test('almost duplicated event from cache is ingested', async () => {
        const meta = resetMeta() as PluginMeta<Plugin>
        const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

        const event = await processEvent(eventToInsert, meta)
        expect(event!.event).toEqual('$pageview')
        expect(event!.timestamp).toEqual('2020-01-01T23:59:59.999999Z')
        expect(event!.properties).toEqual(
            expect.objectContaining({
                distinct_id: 'scbbAqF7uyrMmamV4QBzcA1rrm9wHNISdFweZz-mQ0',
                $os: 'Mac OS X',
                $lib: 'web',
            })
        )

        // Try to insert almost duplicate event
        const almostDuplicateEvent = await processEvent(
            { ...eventToInsert, timestamp: '2020-01-01T23:59:59.999998Z' },
            meta
        )
        expect(almostDuplicateEvent).toBeTruthy()
        expect(almostDuplicateEvent!.timestamp).toEqual('2020-01-01T23:59:59.999998Z') // Timestamp is not the same

        // Both events are stored separately on cache
        let hash = createHash('sha1')
        expect(
            await meta.cache.get(hash.update(`13_007_$pageview_2020-01-01T23:59:59.999999Z`).digest('hex'), null)
        ).toBeTruthy()
        hash = createHash('sha1')
        expect(
            await meta.cache.get(hash.update(`13_007_$pageview_2020-01-01T23:59:59.999998Z`).digest('hex'), null)
        ).toBeTruthy()
    })

    describe('cache with `All properties`', () => {
        test('duplicated event from cache is skipped', async () => {
            const meta = resetMeta({
                config: { ...defaultMeta.config, dedupMode: 'All Properties' },
            }) as PluginMeta<Plugin>
            const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

            const event = await processEvent(eventToInsert, meta)
            expect(event!.event).toEqual('$pageview')
            expect(event!.timestamp).toEqual('2020-01-01T23:59:59.999999Z')
            expect(event!.properties).toEqual(
                expect.objectContaining({
                    distinct_id: 'scbbAqF7uyrMmamV4QBzcA1rrm9wHNISdFweZz-mQ0',
                    $os: 'Mac OS X',
                    $lib: 'web',
                })
            )

            // Try to insert duplicate event
            const duplicateEvent = await processEvent(eventToInsert, meta)
            expect(duplicateEvent).toBeNull() // <- Duplicate event is ignored

            // Event remains in the cache
            const hash = createHash('sha1')
            expect(
                await meta.cache.get(
                    hash
                        .update(`13_007_$pageview_2020-01-01T23:59:59.999999Z_${JSON.stringify(event!.properties)}`)
                        .digest('hex'),
                    null
                )
            ).toBeTruthy()
        })

        test('almost duplicated event from cache is ingested', async () => {
            const meta = resetMeta({
                config: { ...defaultMeta.config, dedupMode: 'All Properties' },
            }) as PluginMeta<Plugin>
            const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

            const event = await processEvent(eventToInsert, meta)
            expect(event!.event).toEqual('$pageview')
            expect(event!.timestamp).toEqual('2020-01-01T23:59:59.999999Z')
            expect(event!.properties).toEqual(
                expect.objectContaining({
                    distinct_id: 'scbbAqF7uyrMmamV4QBzcA1rrm9wHNISdFweZz-mQ0',
                    $os: 'Mac OS X',
                    $lib: 'web',
                })
            )

            // Try to insert almost duplicate event
            const almostDuplicateEvent = await processEvent(
                { ...eventToInsert, properties: { ...event!.properties, $lib: 'ios' } },
                meta
            )
            expect(almostDuplicateEvent).toBeTruthy()
            expect(almostDuplicateEvent!.timestamp).toEqual('2020-01-01T23:59:59.999999Z') // Timestamp is still the same
            expect(almostDuplicateEvent!.properties?.$lib).toEqual('ios') // $lib is different

            // Both events are stored separately on cache
            let hash = createHash('sha1')
            expect(
                await meta.cache.get(
                    hash
                        .update(`13_007_$pageview_2020-01-01T23:59:59.999999Z_${JSON.stringify(event!.properties)}`)
                        .digest('hex'),
                    null
                )
            ).toBeTruthy()
            hash = createHash('sha1')
            expect(
                await meta.cache.get(
                    hash
                        .update(
                            `13_007_$pageview_2020-01-01T23:59:59.999999Z_${JSON.stringify({
                                ...event!.properties,
                                $lib: 'ios',
                            })}`
                        )
                        .digest('hex'),
                    null
                )
            ).toBeTruthy()
        })
    })
})

describe('API-based deduplication', () => {
    test('duplicated event from API is skipped', async () => {
        const meta = resetMeta() as PluginMeta<Plugin>
        const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

        given('getResponse', () => ({
            results: [
                {
                    id: '0180cf53-4aba-0000-6792-423d868a5840',
                    distinct_id: '007',
                    properties: {},
                    timestamp: '2020-01-01T23:59:59.999999Z',
                    event: '$pageview',
                },
            ],
            next: null,
        }))

        const event = await processEvent(eventToInsert, meta)
        expect(event).toBeNull()

        // Event remains in the cache
        const hash = createHash('sha1')
        expect(
            await meta.cache.get(hash.update(`13_007_$pageview_2020-01-01T23:59:59.999999Z`).digest('hex'), null)
        ).toBeTruthy()
    })

    test('almost duplicated event from API is ingested', async () => {
        const meta = resetMeta() as PluginMeta<Plugin>
        const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

        given('getResponse', () => ({
            results: [
                {
                    id: '0180cf53-4aba-0000-6792-423d868a5840',
                    distinct_id: '007',
                    properties: {},
                    timestamp: '2020-01-01T23:59:59.999998Z', // timestamp is different
                    event: '$pageview',
                },
            ],
            next: null,
        }))

        const event = await processEvent(eventToInsert, meta)
        expect(event!.event).toEqual('$pageview')
        expect(event!.timestamp).toEqual('2020-01-01T23:59:59.999999Z')
        expect(event!.properties).toEqual(
            expect.objectContaining({
                distinct_id: 'scbbAqF7uyrMmamV4QBzcA1rrm9wHNISdFweZz-mQ0',
                $os: 'Mac OS X',
                $lib: 'web',
            })
        )
    })

    describe('API with `All properties`', () => {
        test('duplicated event from API is skipped', async () => {
            const meta = resetMeta({
                config: { ...defaultMeta.config, dedupMode: 'All Properties' },
            }) as PluginMeta<Plugin>
            const eventToInsert = { ...createPageview(), timestamp: '2020-01-01T23:59:59.999999Z' }

            given('getResponse', () => ({
                results: [
                    {
                        id: '0180cf53-4aba-0000-6792-423d868a5840',
                        distinct_id: '007',
                        properties: eventToInsert.properties,
                        timestamp: '2020-01-01T23:59:59.999999Z',
                        event: '$pageview',
                    },
                ],
                next: null,
            }))

            const event = await processEvent(eventToInsert, meta)
            expect(event).toBeNull()

            // Event remains in the cache
            const hash = createHash('sha1')
            expect(
                await meta.cache.get(
                    hash
                        .update(
                            `13_007_$pageview_2020-01-01T23:59:59.999999Z_${JSON.stringify(eventToInsert!.properties)}`
                        )
                        .digest('hex'),
                    null
                )
            ).toBeTruthy()
        })

        test('event with matching metadata but mismatching properties is ingested', async () => {
            const meta = resetMeta({
                config: { ...defaultMeta.config, dedupMode: 'All Properties' },
            }) as PluginMeta<Plugin>
            const eventToInsert = { ...createPageview(), timestamp: '2020-06-06T12:12:12.121212Z' }

            given('getResponse', () => ({
                results: [
                    {
                        id: '0180cf53-4aba-0000-6792-423d868a5840',
                        distinct_id: '007',
                        properties: { ...eventToInsert.properties, newProp: true },
                        timestamp: '2020-06-06T12:12:12.121212Z',
                        event: '$pageview',
                    },
                ],
                next: null,
            }))

            const event = await processEvent(eventToInsert, meta)
            expect(event!.event).toEqual('$pageview')
            expect(event!.timestamp).toEqual('2020-06-06T12:12:12.121212Z')

            // Event remains in the cache
            const hash = createHash('sha1')
            expect(
                await meta.cache.get(
                    hash
                        .update(
                            `13_007_$pageview_2020-06-06T12:12:12.121212Z_${JSON.stringify(eventToInsert!.properties)}`
                        )
                        .digest('hex'),
                    null
                )
            ).toBeTruthy()
        })
    })
})
