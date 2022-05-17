import { Plugin } from '@posthog/plugin-scaffold'
import { createHash } from 'crypto'

interface UnduplicatesPluginInterface {
    config: {
        dedupMode: 'Event and Timestamp' | 'All Properties'
    }
}

const plugin: Plugin<UnduplicatesPluginInterface> = {
    processEvent: async (event, { cache, config }) => {
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
        // const response = await global.posthog.api.get('/events')
        // if (response.results && response.results.length) {
        //     // Check against duplicates here
        // }

        // Store event temporarily in cache to make faster checks
        cache.set(eventKey, true, 3_600)

        return event
    },
}

module.exports = plugin
