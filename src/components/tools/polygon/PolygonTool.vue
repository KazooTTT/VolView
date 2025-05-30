<template>
  <div class="overlay-no-events">
    <svg class="overlay-no-events">
      <polygon-widget-2D
        v-for="tool in tools"
        :key="tool.id"
        :tool-id="tool.id"
        :is-placing="tool.id === placingToolID"
        :image-id="imageId"
        :view-id="viewId"
        :view-direction="viewDirection"
        @contextmenu="openContextMenu(tool.id, $event)"
        @placed="onToolPlaced"
        @widgetHover="onHover(tool.id, $event)"
      />
    </svg>
    <annotation-context-menu
      ref="contextMenu"
      :tool-store="activeToolStore"
      v-slot="{ context }"
    >
      <v-list-item @click.stop>
        <template #prepend>
          <v-icon>mdi-grid</v-icon>
        </template>
        <v-list-item-title>Rasterize as...</v-list-item-title>
        <template #append>
          <v-icon icon="mdi-menu-right"></v-icon>
        </template>
        <v-menu :open-on-focus="false" open-on-hover activator="parent" submenu>
          <v-list>
            <template v-if="currentSegmentGroup">
              <v-list-item class="text-subtitle-2">
                <div class="text-caption">Selected segment group:</div>
                <div class="text-subtitle-2">
                  {{ currentSegmentGroup.name }}
                </div>
              </v-list-item>
              <v-list-item
                v-for="segmentID in currentSegmentGroup.segments.order"
                :key="segmentID"
                @click="
                  rasterize(
                    context.forToolID,
                    currentSegmentGroup.segments.byValue[segmentID]
                  )
                "
              >
                <div class="d-flex flex-row align-center ga-3">
                  <ColorDot
                    :color="
                      currentSegmentGroup.segments.byValue[segmentID].color
                    "
                  />
                  <span>
                    {{ currentSegmentGroup.segments.byValue[segmentID].name }}
                  </span>
                </div>
              </v-list-item>
            </template>
            <v-list-item v-else> No segment group selected </v-list-item>
          </v-list>
        </v-menu>
      </v-list-item>
      <v-tooltip
        :disabled="mergePossible"
        text="Shift select multiple polygons that overlap and have the same label."
      >
        <template v-slot:activator="{ props }">
          <div v-bind="props">
            <v-list-item @click="mergeTools" :disabled="!mergePossible">
              <template v-slot:prepend>
                <v-icon>mdi-vector-union</v-icon>
              </template>

              <v-list-item-title>Merge Polygons</v-list-item-title>
            </v-list-item>
          </div>
        </template>
      </v-tooltip>
    </annotation-context-menu>
    <annotation-info :info="overlayInfo" :tool-store="activeToolStore" />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onUnmounted, PropType, toRefs } from 'vue';
import { storeToRefs } from 'pinia';
import { useImage } from '@/src/composables/useCurrentImage';
import { useToolStore } from '@/src/store/tools';
import { Tools } from '@/src/store/tools/types';
import { getLPSAxisFromDir } from '@/src/utils/lps';
import { LPSAxisDir } from '@/src/types/lps';
import { usePolygonStore } from '@/src/store/tools/polygons';
import {
  useContextMenu,
  useCurrentTools,
  useHover,
  usePlacingAnnotationTool,
} from '@/src/composables/annotationTool';
import AnnotationContextMenu from '@/src/components/tools/AnnotationContextMenu.vue';
import AnnotationInfo from '@/src/components/tools/AnnotationInfo.vue';
import { useFrameOfReference } from '@/src/composables/useFrameOfReference';
import { actionToKey } from '@/src/composables/useKeyboardShortcuts';
import { Maybe } from '@/src/types';
import { useSliceInfo } from '@/src/composables/useSliceInfo';
import { useMagicKeys, watchImmediate } from '@vueuse/core';
import { fillPoly } from '@thi.ng/rasterize';
import type { IGrid2D } from '@thi.ng/api';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Vector2, Vector3 } from '@kitware/vtk.js/types';
import { containsPoint } from '@kitware/vtk.js/Common/DataModel/BoundingBox';
import { type ToolID } from '@/src/types/annotation-tool';
import PolygonWidget2D from '@/src/components/tools/polygon/PolygonWidget2D.vue';
import { usePaintToolStore } from '@/src/store/tools/paint';
import { useSegmentGroupStore } from '@/src/store/segmentGroups';
import ColorDot from '@/src/components/ColorDot.vue';
import { SegmentMask } from '@/src/types/segment';

const useActiveToolStore = usePolygonStore;
const toolType = Tools.Polygon;

function createGridAccessor(
  image: vtkImageData,
  slice: number,
  axisIdx: 0 | 1 | 2 // i/j/k
): IGrid2D {
  const axisDims = image.getDimensions();
  axisDims.splice(axisIdx, 1);
  const extent = image.getExtent();
  const pixelData = image.getPointData().getScalars();
  const convertTo3D = (a: number, b: number) => {
    const point = [a, b];
    point.splice(axisIdx, 0, slice);
    return point as Vector3;
  };

  return {
    size: axisDims,
    setAtUnsafe(d0: number, d1: number, value: number): boolean {
      const ijk = convertTo3D(d0, d1);
      if (containsPoint(extent, ...ijk)) {
        const offset = image.computeOffsetIndex(ijk);
        // XXX assumes single-component image
        pixelData.setTuple(offset, [value]);
        return true;
      }
      return false;
    },
  } as unknown as IGrid2D;
}

export default defineComponent({
  name: 'PolygonTool',
  props: {
    viewId: {
      type: String,
      required: true,
    },
    viewDirection: {
      type: String as PropType<LPSAxisDir>,
      required: true,
    },
    imageId: String as PropType<Maybe<string>>,
  },
  components: {
    PolygonWidget2D,
    AnnotationContextMenu,
    AnnotationInfo,
    ColorDot,
  },
  setup(props) {
    const { viewDirection, imageId, viewId } = toRefs(props);
    const toolStore = useToolStore();
    const activeToolStore = useActiveToolStore();
    const { activeLabel } = storeToRefs(activeToolStore);

    const sliceInfo = useSliceInfo(viewId, imageId);
    const slice = computed(() => sliceInfo.value?.slice ?? 0);
    const sliceAxis = computed(() => sliceInfo.value?.axisIndex ?? 0);

    const { metadata: imageMetadata } = useImage(imageId);
    const isToolActive = computed(() => toolStore.currentTool === toolType);
    const viewAxis = computed(() => getLPSAxisFromDir(viewDirection.value));

    // --- active tool management --- //

    const frameOfReference = useFrameOfReference(
      viewDirection,
      slice,
      imageMetadata
    );

    const placingTool = usePlacingAnnotationTool(
      activeToolStore,
      computed(() => {
        if (!imageId.value) return {};
        return {
          imageID: imageId.value,
          frameOfReference: frameOfReference.value,
          slice: slice.value,
          label: activeLabel.value,
          ...(activeLabel.value && activeToolStore.labels[activeLabel.value]),
        };
      })
    );

    watchImmediate([isToolActive, imageId] as const, ([active, imageID]) => {
      placingTool.remove();
      if (active && imageID) {
        placingTool.add();
      }
    });

    onUnmounted(() => {
      placingTool.remove();
    });

    const keys = useMagicKeys();
    const mergeKey = computed(
      () => keys[actionToKey.value.mergeNewPolygon].value
    );

    const onToolPlaced = () => {
      if (imageId.value) {
        const newToolId = placingTool.id.value;
        placingTool.commit();
        placingTool.add();
        if (mergeKey.value && newToolId) {
          activeToolStore.mergeWithOtherTools(newToolId);
        }
      }
    };

    // ---  //

    const { contextMenu, openContextMenu } = useContextMenu();

    const currentTools = useCurrentTools(activeToolStore, viewAxis);

    const { onHover, overlayInfo } = useHover(currentTools, slice);

    const mergePossible = computed(
      () => activeToolStore.mergeableTools.length >= 1
    );

    const segmentGroupStore = useSegmentGroupStore();
    const paintStore = usePaintToolStore();
    const currentSegmentGroup = computed(() => {
      const id = paintStore.activeSegmentGroupID;
      if (!id) return null;
      return segmentGroupStore.metadataByID[id] ?? null;
    });

    function rasterize(toolId: ToolID, segment: SegmentMask) {
      if (!paintStore.activeSegmentGroupID) return;
      const image =
        segmentGroupStore.dataIndex[paintStore.activeSegmentGroupID];
      if (!image) return;

      const points = activeToolStore.getPoints(toolId);
      const axis = sliceAxis.value;

      const indexSpacePoints2D = points.map((pt) => {
        const output = [...image.worldToIndex(pt)];
        output.splice(axis, 1);
        return output as Vector2;
      });

      const grid = createGridAccessor(image, slice.value, axis);
      fillPoly(grid, indexSpacePoints2D, segment.value);
      image.modified();
    }

    return {
      tools: currentTools,
      placingToolID: placingTool.id,
      onToolPlaced,
      contextMenu,
      openContextMenu,
      mergeTools: activeToolStore.mergeSelectedTools,
      mergePossible,
      activeToolStore,
      onHover,
      overlayInfo,
      rasterize,
      currentSegmentGroup,
    };
  },
});
</script>

<style scoped src="@/src/components/styles/vtk-view.css"></style>
