import { EditorRoot } from '../../editor/EditorRoot';
import { WelcomeModal } from '../WelcomeModal';
import { ToolNavbar } from './ToolNavbar';
import { WallStatusLegend } from '../WallStatusLegend';
import { WallChainActionBar } from '../WallChainActionBar';
import { WallPropertiesPanel } from '../WallPropertiesPanel';
import _AxonometraLogo from '../../res/logo.png';
import { embedConfig } from '../../embed/embedConfig';

export function PageLayout() {
  // Embedded host loads the plan via postMessage; the welcome modal
  // would block that flow. Readonly mode hides the toolbar.
  const showWelcomeModal = !embedConfig.embedded;
  const showToolbar = !embedConfig.readonly;

  return (
    <>
      {showWelcomeModal && <WelcomeModal />}
      {showToolbar && <ToolNavbar></ToolNavbar>}
      {/* BuildSmart P4.6 Bloco B — legenda de status de parede sempre
          visível, inclusive em modo readonly (o viewer também precisa
          entender as cores). */}
      <WallStatusLegend />
      {/* BuildSmart usabilidade mobile — só existe ferramenta de desenhar
          parede/seleção com o toolbar visível (readonly não edita nada). */}
      {showToolbar && <WallChainActionBar />}
      {showToolbar && <WallPropertiesPanel />}

      <EditorRoot />
    </>
  );
}
