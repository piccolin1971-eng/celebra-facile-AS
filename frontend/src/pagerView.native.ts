// Wrapper di react-native-pager-view per il rendering NATIVO (Android/iOS).
// Su web Metro caricherà invece pagerView.web.ts (vedi sotto), che esporta
// null in modo che il bundle web non includa il modulo nativo.
import PagerView from "react-native-pager-view";
export default PagerView;
