<img src="logo.png" alt="Unduplicates plugin logo" height="100" />

# PostHog Community Plugin: Unduplicates

This plugin helps prevent duplicate events from being ingested into PostHog. It's particularly helpful if you're backfilling information as you're already ingesting ongoing events. The plugin scopes duplicates for each individual project. The plugin has two modes.

-   **Event and Timestamp**. An event will be treated as duplicate if the timestamp, event name, user's distinct ID matches exactly (in the scope of each project), regardless of what properties are included.
-   **All Properties**. An event will be treated as duplicate only all properties match exactly, as well as the timestamp, event name, user's distinct ID.

The plugin uses temporary cache to perform faster checks and uses PostHog's API to check if duplicate events have already been ingested.

## 🚀 Usage

To use it simply install the plugin from the repository URL: https://github.com/paolodamico/posthog-plugin-unduplicates or search for it in the PostHog Plugin Library.

## 🧑‍💻 Development & testing

Contributions are welcomed! Feel free to open a PR or an issue. To develop locally and contribute to this package, you can simply follow these instructions after clonning the repo.

-   Install dependencies
    ```bash
    yarn install
    ```
-   Run tests
    ```bash
    yarn test
    ```
-   Install plugin in your local instance by going to `/project/plugins` in your PostHog instance, clicking on the "Advanced" tab and entering the full path where you cloned the repo. Please note that running plugins locally on PostHog is currently buggy (see [posthog#7170](https://github.com/PostHog/posthog/issues/7170)).

## 🧑‍⚖️ License

This repository is MIT licensed. Please review the LICENSE file in this repository.

Copyright (C) 2022 Paolo D'Amico.
