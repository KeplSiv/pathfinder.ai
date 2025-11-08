import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getVideoDevices } from "../utils/CameraUtils";

const CameraContext = createContext({
  deviceId: null,
  devices: [],
  setDeviceId: () => {},
  refreshDevices: async () => {},
  isEnumerating: false,
  error: null,
});

export function CameraProvider({ children, autoSelectFirst = true }) {
  const [deviceId, setDeviceId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [isEnumerating, setIsEnumerating] = useState(false);
  const [error, setError] = useState(null);

  const refreshDevices = useCallback(async () => {
    setIsEnumerating(true);
    setError(null);
    try {
      const availableDevices = await getVideoDevices();
      setDevices(availableDevices);
      if (autoSelectFirst && availableDevices.length > 0 && !deviceId) {
        setDeviceId(availableDevices[0].deviceId);
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsEnumerating(false);
    }
  }, [autoSelectFirst, deviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const value = {
    deviceId,
    devices,
    setDeviceId,
    refreshDevices,
    isEnumerating,
    error,
  };

  return (
    <CameraContext.Provider value={value}>{children}</CameraContext.Provider>
  );
}

export function useCameraContext() {
  return useContext(CameraContext);
}

export default CameraContext;
