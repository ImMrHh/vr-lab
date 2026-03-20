      if (rec.fields.Profesor === 'Bloqueado') return false;
      if (rec.fields.Grupo === '-') return false;
      if (rec.fields.Materia === '-') return false;
      if (rec.fields.Actividad === '-') return false;
      if (rec.fields.Materia && rec.fields.Materia.toLowerCase() === 'admin') return false;
      return true;