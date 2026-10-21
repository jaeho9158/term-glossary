// type 이름 → 모듈(원본 types/index.js와 같은 순서).
import linear from './linear.js';
import contrast from './contrast.js';
import hierarchy from './hierarchy.js';
import cycle from './cycle.js';
import matrix from './matrix.js';
import venn from './venn.js';
import timeline from './timeline.js';
import plot from './plot.js';

export default Object.assign(Object.create(null), {
  chain: linear.chain, contrast, hierarchy, procedure: linear.procedure, cycle, matrix, venn, timeline, plot,
});
