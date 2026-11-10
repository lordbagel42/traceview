<script lang="ts">
	import TraceViewer from '#lib/TraceViewer.svelte';
	import { page } from '$app/state';
</script>

<TraceViewer shareId={page.params.id} />
