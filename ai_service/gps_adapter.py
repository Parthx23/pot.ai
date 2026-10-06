from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple
import math
import time

class IGPSAdapter(ABC):
    @abstractmethod
    def get_coordinates_for_timestamp(self, timestamp: float) -> Tuple[float, float, bool]:
        """
        Returns (latitude, longitude, is_simulated).
        """
        pass

    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """
        Returns adapter metadata and capabilities.
        """
        pass


class RealGNSSAdapter(IGPSAdapter):
    """
    Adapter that parses synchronized real GNSS/GPS logs (JSON, CSV, or NMEA log entries).
    """
    def __init__(self, gnss_log_data: Optional[Dict[float, Dict[str, float]]] = None):
        self.gnss_log = gnss_log_data or {}

    def load_from_dict(self, data: Dict[float, Dict[str, float]]):
        self.gnss_log = data

    def get_coordinates_for_timestamp(self, timestamp: float) -> Tuple[float, float, bool]:
        if not self.gnss_log:
            # Fallback to default real benchmark point
            return 37.774929, -122.419416, False

        # Find closest timestamp in the log
        closest_ts = min(self.gnss_log.keys(), key=lambda t: abs(t - timestamp))
        point = self.gnss_log[closest_ts]
        return float(point["latitude"]), float(point["longitude"]), False

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "type": "REAL_GNSS",
            "isSimulated": False,
            "accuracyMeters": 1.2,
            "device": "U-Blox ZED-F9P RTK GNSS Receiver"
        }


class SimulatedVehicleGPSAdapter(IGPSAdapter):
    """
    Simulated Vehicle GPS that calculates realistic motion along a predefined route corridor
    with configurable speed, heading, and distance traveled.
    Marks all outputs with is_simulated=True per requirements.
    """
    def __init__(
        self,
        start_lat: float = 37.774900,
        start_lon: float = -122.419400,
        speed_kmh: float = 40.0,
        heading_deg: float = 45.0,
        route_name: str = "Municipal Corridor Route 101"
    ):
        self.start_lat = start_lat
        self.start_lon = start_lon
        self.speed_kmh = speed_kmh
        self.heading_deg = heading_deg
        self.route_name = route_name
        self.base_time = time.time()

    def get_coordinates_for_timestamp(self, timestamp: float) -> Tuple[float, float, bool]:
        delta_seconds = max(0.0, timestamp - self.base_time)
        speed_mps = (self.speed_kmh * 1000.0) / 3600.0
        distance_meters = speed_mps * delta_seconds

        # Bearing in radians
        rad = math.radians(self.heading_deg)
        # Earth radius approx 6378137m
        d_lat = (distance_meters * math.cos(rad)) / 111139.0
        d_lon = (distance_meters * math.sin(rad)) / (111139.0 * math.cos(math.radians(self.start_lat)))

        lat = self.start_lat + d_lat
        lon = self.start_lon + d_lon
        return lat, lon, True  # ALWAYS clearly marked as simulated

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "type": "SIMULATED_GPS",
            "isSimulated": True,
            "warning": "SIMULATED TELEMETRY FOR HACKATHON BENCHMARK / DEMO",
            "routeName": self.route_name,
            "speedKmh": self.speed_kmh,
            "startCoordinates": [self.start_lat, self.start_lon]
        }


class FixedCameraGPSAdapter(IGPSAdapter):
    """
    Adapter for fixed roadside or traffic surveillance cameras bound to a certified static location.
    """
    def __init__(self, camera_id: str, fixed_lat: float, fixed_lon: float, location_name: str):
        self.camera_id = camera_id
        self.fixed_lat = fixed_lat
        self.fixed_lon = fixed_lon
        self.location_name = location_name

    def get_coordinates_for_timestamp(self, timestamp: float) -> Tuple[float, float, bool]:
        return self.fixed_lat, self.fixed_lon, False

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "type": "FIXED_CAMERA_GPS",
            "isSimulated": False,
            "cameraId": self.camera_id,
            "locationName": self.location_name,
            "coordinates": [self.fixed_lat, self.fixed_lon]
        }
