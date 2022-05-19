import { Plugin, PluginEvent } from '@posthog/plugin-scaffold'
import { createHash, randomUUID } from 'crypto'
import { URLSearchParams } from 'url'

interface UnduplicatesPluginInterface {
    config: {
        dedupMode: 'Event and Timestamp' | 'All Properties'
    }
}

const stringifyEvent = (event: PluginEvent): string => {
    return `(${randomUUID().toString()}; project #${event.team_id}). Event "${event.event}" @ ${
        event.timestamp
    } for user ${event.distinct_id}.`
}

const logDuplicate = (stringifiedEvent: string, location: 'cache' | 'API'): void => {
    console.info(`Prevented duplicate event ingestion from ${location}. ${stringifiedEvent}`)
}

const plugin: Plugin<UnduplicatesPluginInterface> = {
    processEvent: async (event, { cache, config }) => {
        const stringifiedEvent = stringifyEvent(event)
        console.debug(`Beginning processing. ${stringifiedEvent}`)

        if (!event.timestamp) {
            console.warn('Received event without a timestamp, this plugin will not work without it. Skipping.')
            return event
        }

        // Check if event is in cache (hashed to limit memory usage)
        const stringifiedProps = config.dedupMode === 'All Properties' ? `_${JSON.stringify(event.properties)}` : ''
        const hash = createHash('sha1')
        const eventKey = hash
            .update(`${event.team_id}_${event.distinct_id}_${event.event}_${event.timestamp}${stringifiedProps}`)
            .digest('hex')

        const cachedEvent = await cache.get(eventKey, null)
        if (cachedEvent) {
            logDuplicate(stringifiedEvent, 'cache')
            return null
        }

        // Store event temporarily in cache to make faster checks
        cache.set(eventKey, true, 3600)

        // Check if event is already stored in PostHog
        const searchTimestamp = new Date(event.timestamp)
        searchTimestamp.setMilliseconds(searchTimestamp.getMilliseconds() - 1000)
        const urlParams = new URLSearchParams({
            distinct_id: event.distinct_id,
            orderBy: '["-timestamp"]',
            event: event.event,
            after: searchTimestamp.toISOString(),
        })
        const response = await (
            await posthog.api.get(`/api/projects/${event.team_id}/events/?${urlParams.toString()}`)
        ).json()
        
        // a bit 🍝 no? can we simplify this?
        if (response.results && response.results.length) {
            for (const potentialMatch of response.results as PluginEvent[]) {
                if (potentialMatch.timestamp === event.timestamp) {
                    if (config.dedupMode === 'All Properties') {
                        if (JSON.stringify(event.properties) === JSON.stringify(potentialMatch.properties)) {
                            logDuplicate(stringifiedEvent, 'API')
                            return null
                        }
                    } else {
                        logDuplicate(stringifiedEvent, 'API')
                        return null
                    }
                }
            }
        }

        return event
    },
}

module.exports = plugin
