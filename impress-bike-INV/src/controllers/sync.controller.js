import {
  getFullSyncStatus,
  syncSafeRecords,
  resolveConflict,
} from "../services/sync.service.js";

export const getSyncStatus = async (req, res) => {
  try {
    const status = await getFullSyncStatus();
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const runSync = async (req, res) => {
  try {
    const results = await syncSafeRecords();
    const updatedStatus = await getFullSyncStatus();
    return res.status(200).json({
      success: true,
      message: "Sync completed successfully",
      data: { results, currentStatus: updatedStatus },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const resolveSyncConflict = async (req, res) => {
  const { modelName, id, action } = req.body;
  if (!modelName || !id || !action) {
    return res.status(400).json({
      success: false,
      message: "modelName, id, and action are required",
    });
  }

  try {
    const result = await resolveConflict({ modelName, id, action });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
