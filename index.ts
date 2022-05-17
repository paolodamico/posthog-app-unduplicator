import { Plugin } from '@posthog/plugin-scaffold'
import { createHash } from 'crypto'

interface UnduplicatesPluginInterface {
    config: {
        dedupMode: 'Event and Timestamp' | 'All Properties'
    }
}

const plugin: Plugin<UnduplicatesPluginInterface> = {
    processEvent: async (event, { cache, config }) => {
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
            console.log(
                `Prevented duplicate event ingestion. ${event.event} @ ${event.timestamp} for user ${event.distinct_id} on Project ID ${event.team_id}`
            )
            return null
        }

        // Check if event is already stored in PostHog
        const searchTimestamp = new Date(event.timestamp)
        searchTimestamp.setMilliseconds(searchTimestamp.getMilliseconds() - 1_000)
        const urlParams = new URLSearchParams({
            distinct_id: event.distinct_id,
            orderBy: '["-timestamp"]',
            event: event.event,
            after: searchTimestamp.toISOString(),
        })
        const response = await (
            await posthog.api.get(`/api/projects/${event.team_id}/events/?${urlParams.toString()}`)
        ).json()
        if (response.results && response.results.length) {
            // Check against duplicates here
        }

        // Store event temporarily in cache to make faster checks
        cache.set(eventKey, true, 3_600)

        return event
    },
}

module.exports = plugin
